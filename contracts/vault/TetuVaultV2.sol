// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../vault/ERC4626Upgradeable.sol";
import "../proxy/ControllableV3.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IGauge.sol";
import "../openzeppelin/Math.sol";
import "./VaultInsurance.sol";

/// @title Vault for storing underlying tokens and managing them with strategy splitter.
/// @author belbix
contract TetuVaultV2 is ERC4626Upgradeable, ControllableV3, ITetuVaultV2 {
  using SafeERC20 for IERC20;
  using FixedPointMathLib for uint;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VAULT_VERSION = "2.0.0";
  /// @dev Denominator for buffer calculation. 100% of the buffer amount.
  uint private constant BUFFER_DENOMINATOR = 100_000;
  /// @dev Denominator for fee calculation.
  uint constant public FEE_DENOMINATOR = 100_000;
  /// @dev Max 1% fee.
  uint constant public MAX_FEE = FEE_DENOMINATOR / 100;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Strategy splitter. Could be zero address.
  ISplitter public splitter;
  /// @dev Connected gauge for stakeless rewards
  IGauge public gauge;
  /// @dev Dedicated contract for holding insurance for covering share price loss.
  VaultInsurance public insurance;
  /// @dev Percent of assets that will always stay in this vault.
  uint public buffer;

  /// @dev Maximum amount for withdraw. Max UINT256 by default.
  uint internal _maxWithdrawAssets;
  /// @dev Maximum amount for redeem. Max UINT256 by default.
  uint internal _maxRedeemShares;
  /// @dev Fee for deposit/mint actions. Zero by default.
  uint public depositFee;
  /// @dev Fee for withdraw/redeem actions. Zero by default.
  uint public withdrawFee;

  /// @dev Trigger doHardwork on invest action. Enabled by default.
  bool public doHardWorkOnInvest;

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
  event SplitterChanged(address oldValue, address newValue);
  event BufferChanged(uint oldValue, uint newValue);
  event Invest(address splitter, uint amount);
  event MaxWithdrawChanged(uint maxAssets, uint maxShares);
  event FeeChanged(uint depositFee, uint withdrawFee);
  event DoHardWorkOnInvestChanged(bool oldValue, bool newValue);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(
    address controller_,
    IERC20 _asset,
    string memory _name,
    string memory _symbol,
    address _gauge,
    uint _buffer
  ) external initializer {
    require(_buffer <= BUFFER_DENOMINATOR, "!BUFFER");
    require(_gauge != address(0), "!GAUGE");
    require(IControllable(_gauge).isController(controller_), "!GAUGE_CONTROLLER");

    __ERC4626_init(_asset, _name, _symbol);
    __Controllable_init(controller_);

    gauge = IGauge(_gauge);
    buffer = _buffer;

    // create insurance contract
    insurance = new VaultInsurance(_asset);

    // set defaults
    _maxWithdrawAssets = type(uint).max;
    _maxRedeemShares = type(uint).max;
    doHardWorkOnInvest = true;

    emit Init(
      controller_,
      address(_asset),
      _name,
      _symbol,
      _gauge,
      _buffer
    );
  }

  // *************************************************************
  //                      GOV ACTIONS
  // *************************************************************

  /// @dev Set new buffer value. Should be lower than denominator.
  function setBuffer(uint _buffer) external {
    require(isGovernance(msg.sender), "DENIED");
    require(_buffer <= BUFFER_DENOMINATOR, "BUFFER");

    emit BufferChanged(buffer, _buffer);
    buffer = _buffer;
  }

  /// @dev Set maximum available to withdraw amounts.
  ///      Could be zero values in emergency case when need to pause malicious actions.
  function setMaxWithdraw(uint maxAssets, uint maxShares) external {
    require(isGovernance(msg.sender), "DENIED");

    _maxWithdrawAssets = maxAssets;
    _maxRedeemShares = maxShares;
    emit MaxWithdrawChanged(maxAssets, maxShares);
  }

  /// @dev Set deposit/withdraw fees
  function setFees(uint _depositFee, uint _withdrawFee) external {
    require(isGovernance(msg.sender), "DENIED");
    require(_depositFee <= MAX_FEE && _withdrawFee <= MAX_FEE, "TOO_HIGH");

    depositFee = _depositFee;
    withdrawFee = _withdrawFee;
    emit FeeChanged(_depositFee, _withdrawFee);
  }

  /// @dev If activated will call doHardWork on splitter on each invest action.
  function setDoHardWorkOnInvest(bool value) external {
    require(isGovernance(msg.sender), "DENIED");
    emit DoHardWorkOnInvestChanged(doHardWorkOnInvest, value);
    doHardWorkOnInvest = value;
  }

  /// @dev Change splitter address. If old value exist properly withdraw and remove allowance.
  function setSplitter(address _splitter) external override {
    address oldSplitter = address(splitter);
    IERC20 _asset = asset;
    require(oldSplitter == address(0)
      || IController(controller()).vaultController() == msg.sender, "DENIED");
    require(ISplitter(_splitter).asset() == address(_asset), "WRONG_UNDERLYING");
    require(ISplitter(_splitter).vault() == address(this), "WRONG_VAULT");
    require(IControllable(_splitter).isController(controller()), "WRONG_CONTROLLER");
    if (oldSplitter != address(0)) {
      _asset.safeApprove(oldSplitter, 0);
      ISplitter(oldSplitter).withdrawAllToVault();
    }
    _asset.safeApprove(_splitter, 0);
    _asset.safeApprove(_splitter, type(uint).max);
    splitter = ISplitter(_splitter);
    emit SplitterChanged(oldSplitter, _splitter);
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Total amount of the underlying asset that is “managed” by Vault
  function totalAssets() public view override returns (uint) {
    return asset.balanceOf(address(this)) + splitter.totalAssets();
  }

  /// @dev Amount of assets under control of strategy splitter.
  function splitterAssets() external view returns (uint) {
    return splitter.totalAssets();
  }

  /// @dev Price of 1 full share
  function sharePrice() external view returns (uint) {
    uint units = 10 ** uint256(decimals());
    uint totalSupply_ = _totalSupply;
    return totalSupply_ == 0
    ? units
    : units * totalAssets() / totalSupply_;
  }

  // *************************************************************
  //                 DEPOSIT LOGIC
  // *************************************************************

  function previewDeposit(uint assets) public view virtual override returns (uint) {
    uint shares = convertToShares(assets);
    return shares - (shares * depositFee / FEE_DENOMINATOR);
  }

  function previewMint(uint shares) public view virtual override returns (uint) {
    uint supply = _totalSupply;
    if (supply != 0) {
      uint assets = shares.mulDivUp(totalAssets(), supply);
      return assets * FEE_DENOMINATOR / (FEE_DENOMINATOR - depositFee);
    } else {
      return shares * FEE_DENOMINATOR / (FEE_DENOMINATOR - depositFee);
    }
  }

  /// @dev Calculate available to invest amount and send this amount to splitter
  function afterDeposit(uint assets, uint) internal override {
    address _splitter = address(splitter);
    IERC20 _asset = asset;
    uint _depositFee = depositFee;
    // send fee to insurance contract
    if (_depositFee != 0) {
      _asset.safeTransfer(address(insurance), assets * _depositFee / FEE_DENOMINATOR);
    }
    uint256 toInvest = _availableToInvest(_splitter, _asset);
    // invest only when buffer is filled
    if (toInvest > 0) {

      // need to check recursive hardworks
      if (doHardWorkOnInvest && !ISplitter(_splitter).isHardWorking()) {
        ISplitter(_splitter).doHardWork();
      }

      _asset.safeTransfer(_splitter, toInvest);
      ISplitter(_splitter).investAllAssets();
      emit Invest(_splitter, toInvest);
    }
  }

  /// @notice Returns amount of assets ready to invest to the splitter
  function _availableToInvest(address _splitter, IERC20 _asset) internal view returns (uint) {
    uint _buffer = buffer;
    if (_splitter == address(0) || _buffer == BUFFER_DENOMINATOR) {
      return 0;
    }
    uint assetsInVault = _asset.balanceOf(address(this));
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

  function withdrawAll() external {
    redeem(balanceOf(msg.sender), msg.sender, msg.sender);
  }

  function previewWithdraw(uint assets) public view virtual override returns (uint) {
    uint supply = _totalSupply;
    uint _totalAssets = totalAssets();
    if (_totalAssets == 0) {
      return assets;
    }
    uint shares = assets.mulDivUp(supply, _totalAssets);
    shares = shares * FEE_DENOMINATOR / (FEE_DENOMINATOR - withdrawFee);
    return supply == 0 ? assets : shares;
  }

  function previewRedeem(uint shares) public view virtual override returns (uint) {
    shares = shares - (shares * withdrawFee / FEE_DENOMINATOR);
    return convertToAssets(shares);
  }

  function maxWithdraw(address owner) public view override returns (uint) {
    return Math.min(_maxWithdrawAssets, convertToAssets(_balances[owner]));
  }

  function maxRedeem(address owner) public view override returns (uint) {
    return Math.min(_maxRedeemShares, _balances[owner]);
  }

  /// @dev Internal hook for getting necessary assets from splitter.
  function beforeWithdraw(
    uint assets,
    uint shares
  ) internal override {
    uint _withdrawFee = withdrawFee;
    uint fromSplitter;
    if (_withdrawFee != 0) {
      // add fee amount
      fromSplitter = assets * FEE_DENOMINATOR / (FEE_DENOMINATOR - _withdrawFee);
    } else {
      fromSplitter = assets;
    }

    IERC20 _asset = asset;
    uint balance = _asset.balanceOf(address(this));
    // if not enough balance in the vault withdraw from strategies
    if (balance < fromSplitter) {
      _processWithdrawFromSplitter(
        fromSplitter,
        shares,
        _totalSupply,
        buffer,
        splitter,
        balance
      );
    }
    balance = _asset.balanceOf(address(this));
    require(assets <= balance, "SLIPPAGE");

    // send fee amount to insurance for keep correct calculations
    // in case of compensation it will lead to double transfer
    // but we assume that it will be rare case
    if (_withdrawFee != 0) {
      // we should compensate possible slippage from user fee too
      uint toFees = Math.min(fromSplitter - assets, balance - assets);
      if (toFees != 0) {
        _asset.safeTransfer(address(insurance), toFees);
      }
    }
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
      uint missing = (assetsInSplitter + assetsInVault)
      * _buffer / BUFFER_DENOMINATOR
      + assetsNeed;
      missing = Math.min(missing, assetsInSplitter);
      // if zero should be resolved on splitter side
      _splitter.withdrawToVault(missing);
    }

  }

  // *************************************************************
  //                 INSURANCE LOGIC
  // *************************************************************

  function coverLoss(uint amount) external override {
    require(msg.sender == address(splitter), "!SPLITTER");
    insurance.transferToVault(amount);
  }

  // *************************************************************
  //                 GAUGE HOOK
  // *************************************************************

  /// @dev Connect this vault to the gauge
  function _afterTokenTransfer(
    address from,
    address to,
    uint
  ) internal override {
    gauge.handleBalanceChange(from);
    gauge.handleBalanceChange(to);
  }

}
