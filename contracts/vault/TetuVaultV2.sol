// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../openzeppelin/Math.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IGauge.sol";
import "../proxy/ControllableV3.sol";
import "./ERC4626Upgradeable.sol";

/// @title Vault for storing underlying tokens and managing them with strategy splitter.
/// @author belbix
/// @author a17
contract TetuVaultV2 is ERC4626Upgradeable, ControllableV3, ITetuVaultV2 {
  using SafeERC20 for IERC20;
  using Math for uint;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VAULT_VERSION = "3.0.0";

  /// @dev Denominator for buffer calculation. 100% of the buffer amount.
  uint constant public BUFFER_DENOMINATOR = 100_000;

  uint constant internal SLIPPAGE_DENOMINATOR = 100_000; // 100%

  uint constant internal MAX_WITHDRAW_SLIPPAGE = 500; // 0.5%

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Strategy splitter. Should be setup after deploy.
  ISplitter public splitter;
  /// @dev Connected gauge for stakeless rewards
  IGauge public gauge;
  /// @dev Dedicated contract for holding insurance for covering share price loss.
  IVaultInsurance public override insurance;
  /// @dev Percent of assets that will always stay in this vault.
  uint public buffer;

  /// @dev Maximum amount for withdraw. Max uint by default.
  uint public maxWithdrawAssets;
  /// @dev Maximum amount for redeem. Max uint by default.
  uint public maxRedeemShares;
  /// @dev Maximum amount for deposit. Max uint by default.
  uint public maxDepositAssets;
  /// @dev Maximum amount for mint. Max uint by default.
  uint public maxMintShares;

  /// @dev Trigger doHardwork on invest action. Enabled by default.
  bool public doHardWorkOnInvest;

  /// @dev msg.sender => block when request sent. Should be cleared on deposit/withdraw action
  ///      For simplification we are setup new withdraw request on each deposit/transfer
  mapping(address => uint) public withdrawRequests;

  /// @dev A user should wait this block amounts before able to withdraw.
  uint public withdrawRequestBlocks;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Init(
    address controller,
    address asset,
    string name,
    string symbol,
    address gauge,
    uint buffer
  );
  event SplitterSetup(address splitter);
  event BufferChanged(uint oldValue, uint newValue);
  event Invest(address splitter, uint amount);
  event MaxWithdrawChanged(uint maxAssets, uint maxShares);
  event MaxDepositChanged(uint maxAssets, uint maxShares);
  event DoHardWorkOnInvestChanged(bool oldValue, bool newValue);
  event LossCovered(uint amount, uint requestedAmount, uint balance);
  event WithdrawRequested(address sender, uint startBlock);
  event WithdrawRequestBlocks(uint blocks);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(
    address controller_,
    IERC20 asset_,
    string memory _name,
    string memory _symbol,
    address _gauge,
    uint _buffer
  ) external initializer override {
    require(_buffer <= BUFFER_DENOMINATOR, "!BUFFER");
    require(_gauge != address(0), "!GAUGE");
    require(IControllable(_gauge).isController(controller_), "!GAUGE_CONTROLLER");

    _requireERC20(address(asset_));
    __ERC4626_init(asset_, _name, _symbol);
    __Controllable_init(controller_);

    _requireInterface(_gauge, InterfaceIds.I_GAUGE);
    gauge = IGauge(_gauge);
    buffer = _buffer;

    // set defaults
    maxWithdrawAssets = type(uint).max;
    maxRedeemShares = type(uint).max;
    maxDepositAssets = type(uint).max - 1;
    maxMintShares = type(uint).max - 1;
    doHardWorkOnInvest = true;
    withdrawRequestBlocks = 5;
    emit WithdrawRequestBlocks(5);

    emit Init(
      controller_,
      address(asset_),
      _name,
      _symbol,
      _gauge,
      _buffer
    );
  }

  function initInsurance(IVaultInsurance _insurance) external override {
    require(address(insurance) == address(0), "INITED");
    _requireInterface(address(_insurance), InterfaceIds.I_VAULT_INSURANCE);

    require(_insurance.vault() == address(this), "!VAULT");
    require(_insurance.asset() == address(_asset), "!ASSET");
    insurance = _insurance;
  }

  // *************************************************************
  //                      GOV ACTIONS
  // *************************************************************

  /// @dev Set block amount before user will able to withdraw after a request.
  function setWithdrawRequestBlocks(uint blocks) external {
    require(isGovernance(msg.sender), "DENIED");
    withdrawRequestBlocks = blocks;
    emit WithdrawRequestBlocks(blocks);
  }

  /// @dev Set new buffer value. Should be lower than denominator.
  function setBuffer(uint _buffer) external {
    require(isGovernance(msg.sender), "DENIED");
    require(_buffer <= BUFFER_DENOMINATOR, "BUFFER");

    emit BufferChanged(buffer, _buffer);
    buffer = _buffer;
  }

  /// @dev Set maximum available to deposit amounts.
  ///      Could be zero values in emergency case when need to pause malicious actions.
  function setMaxDeposit(uint maxAssets, uint maxShares) external {
    require(isGovernance(msg.sender), "DENIED");

    maxDepositAssets = maxAssets;
    maxMintShares = maxShares;
    emit MaxDepositChanged(maxAssets, maxShares);
  }

  /// @dev Set maximum available to withdraw amounts.
  ///      Could be zero values in emergency case when need to pause malicious actions.
  function setMaxWithdraw(uint maxAssets, uint maxShares) external {
    require(isGovernance(msg.sender), "DENIED");

    maxWithdrawAssets = maxAssets;
    maxRedeemShares = maxShares;
    emit MaxWithdrawChanged(maxAssets, maxShares);
  }

  /// @dev If activated will call doHardWork on splitter on each invest action.
  function setDoHardWorkOnInvest(bool value) external {
    require(isGovernance(msg.sender), "DENIED");
    emit DoHardWorkOnInvestChanged(doHardWorkOnInvest, value);
    doHardWorkOnInvest = value;
  }

  /// @dev Set splitter address. Can not change exist splitter.
  function setSplitter(address _splitter) external override {
    IERC20 asset_ = _asset;
    require(address(splitter) == address(0), "DENIED");
    _requireInterface(_splitter, InterfaceIds.I_SPLITTER);
    require(ISplitter(_splitter).asset() == address(asset_), "WRONG_UNDERLYING");
    require(ISplitter(_splitter).vault() == address(this), "WRONG_VAULT");
    require(IControllable(_splitter).isController(controller()), "WRONG_CONTROLLER");
    asset_.approve(_splitter, type(uint).max);
    splitter = ISplitter(_splitter);
    emit SplitterSetup(_splitter);
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Total amount of the underlying asset that is “managed” by Vault
  function totalAssets() public view override returns (uint) {
    return _asset.balanceOf(address(this)) + splitter.totalAssets();
  }

  /// @dev Amount of assets under control of strategy splitter.
  function splitterAssets() external view returns (uint) {
    return splitter.totalAssets();
  }

  /// @dev Price of 1 full share
  function sharePrice() external view returns (uint) {
    uint units = 10 ** uint(decimals());
    uint totalSupply_ = totalSupply();
    return totalSupply_ == 0
      ? units
      : units * totalAssets() / totalSupply_;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_TETU_VAULT_V2 || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                 DEPOSIT LOGIC
  // *************************************************************

  function previewDeposit(uint assets) public view virtual override returns (uint) {
    return convertToShares(assets);
  }

  function previewMint(uint shares) public view virtual override returns (uint) {
    uint supply = totalSupply();
    if (supply != 0) {
      return shares.mulDiv(totalAssets(), supply, Math.Rounding.Up);
    }
    return shares;
  }

  /// @dev Calculate available to invest amount and send this amount to splitter
  function afterDeposit(uint /*assets*/, uint /*shares*/, address receiver) internal override {
    // reset withdraw request if necessary
    if (withdrawRequestBlocks != 0) {
      withdrawRequests[receiver] = block.number;
    }

    address _splitter = address(splitter);
    IERC20 asset_ = _asset;
    uint toInvest = _availableToInvest(_splitter, asset_);
    // invest only when buffer is filled
    if (toInvest > 0) {

      // need to check recursive hardworks
      if (doHardWorkOnInvest && !ISplitter(_splitter).isHardWorking()) {
        ISplitter(_splitter).doHardWork();
      }

      asset_.safeTransfer(_splitter, toInvest);
      ISplitter(_splitter).investAll();
      emit Invest(_splitter, toInvest);
    }
  }

  /// @notice Returns amount of assets ready to invest to the splitter
  function _availableToInvest(address _splitter, IERC20 asset_) internal view returns (uint) {
    uint _buffer = buffer;
    if (_splitter == address(0) || _buffer == BUFFER_DENOMINATOR) {
      return 0;
    }
    uint assetsInVault = asset_.balanceOf(address(this));
    uint assetsInSplitter = ISplitter(_splitter).totalAssets();
    uint wantInvestTotal = (assetsInVault + assetsInSplitter)
    * (BUFFER_DENOMINATOR - _buffer) / BUFFER_DENOMINATOR;
    if (assetsInSplitter >= wantInvestTotal) {
      return 0;
    } else {
      uint remainingToInvest = wantInvestTotal - assetsInSplitter;
      return remainingToInvest <= assetsInVault ? remainingToInvest : assetsInVault;
    }
  }

  // *************************************************************
  //                 WITHDRAW LOGIC
  // *************************************************************

  function requestWithdraw() external {
    withdrawRequests[msg.sender] = block.number;
    emit WithdrawRequested(msg.sender, block.number);
  }

  /// @dev Withdraw all available shares for tx sender.
  ///      The revert is expected if the balance is higher than `maxRedeem`
  function withdrawAll() external {
    redeem(balanceOf(msg.sender), msg.sender, msg.sender);
  }

  function previewWithdraw(uint assets) public view virtual override returns (uint) {
    uint supply = totalSupply();
    uint _totalAssets = totalAssets();
    if (_totalAssets == 0) {
      return assets;
    }
    uint shares = assets.mulDiv(supply, _totalAssets, Math.Rounding.Up);
    return supply == 0 ? assets : shares;
  }

  function previewRedeem(uint shares) public view virtual override returns (uint) {
    return convertToAssets(shares);
  }

  function maxDeposit(address) public view override returns (uint) {
    return maxDepositAssets;
  }

  function maxMint(address) public view override returns (uint) {
    return maxMintShares;
  }

  function maxWithdraw(address owner) public view override returns (uint) {
    uint assets = convertToAssets(balanceOf(owner));
    return Math.min(maxWithdrawAssets, assets);
  }

  function maxRedeem(address owner) public view override returns (uint) {
    return Math.min(maxRedeemShares, balanceOf(owner));
  }

  /// @dev Internal hook for getting necessary assets from splitter.
  function beforeWithdraw(uint assets, uint shares, address /*receiver*/, address owner_) internal override {
    // check withdraw request if necessary
    uint _withdrawRequestBlocks = withdrawRequestBlocks;
    if (_withdrawRequestBlocks != 0) {
      // ensure that at least {_withdrawRequestBlocks} blocks were passed since last deposit/withdraw of the owner
      uint wr = withdrawRequests[owner_];
      require(wr != 0 && wr + _withdrawRequestBlocks < block.number, "NOT_REQUESTED");
      withdrawRequests[owner_] = block.number;
    }

    uint fromSplitter = assets;

    IERC20 asset_ = _asset;
    uint balance = asset_.balanceOf(address(this));
    // if not enough balance in the vault withdraw from strategies
    if (balance < fromSplitter) {
      _processWithdrawFromSplitter(
        fromSplitter,
        shares,
        totalSupply(),
        buffer,
        splitter,
        balance
      );
    }
    balance = asset_.balanceOf(address(this));
    uint slippage;
    if (assets > balance) {
      uint withdrawLoss = assets - balance;
      _withdrawLoss = withdrawLoss;
      slippage = SLIPPAGE_DENOMINATOR * withdrawLoss / assets;
    }
    require(slippage <= MAX_WITHDRAW_SLIPPAGE, "SLIPPAGE");
  }

  /// @dev Do necessary calculation for withdrawing from splitter and move assets to vault.
  ///      If splitter not defined must not be called.
  function _processWithdrawFromSplitter(
    uint assetsNeed,
    uint shares,
    uint totalSupply_,
    uint _buffer,
    ISplitter _splitter,
    uint assetsInVault
  ) internal {
    // withdraw everything from the splitter to accurately check the share value
    if (shares == totalSupply_) {
      _splitter.withdrawAllToVault();
    } else {
      uint assetsInSplitter = _splitter.totalAssets();

      // we should always have buffer amount inside the vault
      // assume `assetsNeed` can not be higher than entire balance
      uint expectedBuffer = (assetsInSplitter + assetsInVault - assetsNeed) * _buffer / BUFFER_DENOMINATOR;

      // this code should not be called if `assetsInVault` higher than `assetsNeed`
      uint missing = Math.min(expectedBuffer + assetsNeed - assetsInVault, assetsInSplitter);
      // if zero should be resolved on splitter side
      _splitter.withdrawToVault(missing);
    }
  }

  // *************************************************************
  //                 GAUGE HOOK
  // *************************************************************

  /// @dev Connect this vault to the gauge for non-contract addresses.
  function _afterTokenTransfer(
    address from,
    address to,
    uint
  ) internal override {
    // refresh withdraw request if necessary
    if (withdrawRequestBlocks != 0) {
      withdrawRequests[from] = block.number;
      withdrawRequests[to] = block.number;
    }
    gauge.handleBalanceChange(from);
    gauge.handleBalanceChange(to);
  }

}
