// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../vault/ERC4626Upgradeable.sol";
import "../proxy/ControllableV3.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IGauge.sol";
import "../openzeppelin/Math.sol";

/// @title Vault for storing underlying tokens and managing them with strategy splitter.
/// @author belbix
contract TetuVaultV2 is ERC4626Upgradeable, ControllableV3 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VAULT_VERSION = "2.0.0";
  /// @dev Denominator for buffer calculation. 100% of the buffer amount.
  uint private constant BUFFER_DENOMINATOR = 1000;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Strategy splitter. Could be zero address.
  ISplitter public splitter;
  /// @dev Connected gauge for stakeless rewards
  IGauge public gauge;
  /// @dev Percent of assets that will always stay in this vault.
  uint public buffer;

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

    __ERC4626_init(_asset, _name, _symbol);
    __Controllable_init(controller_);

    gauge = IGauge(_gauge);
    buffer = _buffer;

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

  /// @dev Change splitter address. If old value exist properly withdraw and remove allowance.
  function setSplitter(address _splitter) external {
    address oldSplitter = address(splitter);
    IERC20 _asset = asset;
    require(oldSplitter == address(0) || isController(msg.sender), "DENIED");
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
    return asset.balanceOf(address(this)) + splitterAssets();
  }

  /// @dev Amount of assets under control of strategy splitter.
  function splitterAssets() public view returns (uint) {
    return splitter.totalAssets();
  }

  // *************************************************************
  //                 INTERNAL LOGIC
  // *************************************************************

  /// @dev Internal hook for getting necessary assets from splitter.
  function beforeWithdraw(
    uint assets,
    uint shares
  ) internal override returns (uint assetsAdjusted, uint sharesAdjusted) {
    IERC20 _asset = asset;
    sharesAdjusted = shares;
    uint balance = _asset.balanceOf(address(this));
    if (balance < assets) {
      assetsAdjusted = _processWithdrawFromSplitter(
        shares,
        _asset,
        _totalSupply,
        buffer,
        splitter
      );
    } else {
      assetsAdjusted = assets;
    }
  }

  /// @dev Do necessary calculation for withdrawing from splitter and move assets to vault.
  ///      If splitter not defined must not be called.
  function _processWithdrawFromSplitter(
    uint _shares,
    IERC20 _asset,
    uint totalSupply_,
    uint _buffer,
    ISplitter _splitter
  ) internal returns (uint) {
    uint assetsInVault = _asset.balanceOf(address(this));
    uint assetsInSplitter = _splitter.totalAssets();
    uint assetsNeed = (assetsInSplitter + assetsInVault) * _shares / totalSupply_;
    if (assetsNeed > assetsInVault) {
      // withdraw everything from the splitter to accurately check the share value
      if (_shares == totalSupply_) {
        _splitter.withdrawAllToVault();
      } else {
        // we should always have buffer amount inside the vault
        uint missing = (assetsInSplitter + assetsInVault)
        * _buffer / BUFFER_DENOMINATOR
        + assetsNeed;
        missing = Math.min(missing, assetsInSplitter);
        if (missing > 0) {
          _splitter.withdrawToVault(missing);
        }
      }
      assetsInVault = IERC20(_asset).balanceOf(address(this));
    }
    // recalculate to improve accuracy
    assetsNeed = Math.min(
      (assetsInVault + _splitter.totalAssets()) * _shares / totalSupply_,
      assetsInVault
    );
    return assetsNeed;
  }

  /// @dev Calculate available to invest amount and send this amount to splitter
  function afterDeposit(uint, uint) internal override {
    address _splitter = address(splitter);
    IERC20 _asset = asset;
    uint256 toInvest = _availableToInvest(_splitter, _asset);
    if (toInvest > 0) {
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
