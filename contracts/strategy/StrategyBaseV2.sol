// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/Math.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IForwarder.sol";
import "../proxy/ControllableV3.sol";

/// @title Abstract contract for base strategy functionality
/// @author belbix
abstract contract StrategyBaseV2 is IStrategyV2, ControllableV3 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant STRATEGY_BASE_VERSION = "2.0.0";
  /// @dev Denominator for compound ratio
  uint public constant COMPOUND_DENOMINATOR = 100_000;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Underlying asset
  address public override asset;
  /// @dev Linked splitter
  address public override splitter;
  /// @dev Percent of profit for autocompound inside this strategy.
  uint public override compoundRatio;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event WithdrawAllToSplitter(uint amount);
  event WithdrawToSplitter(uint amount, uint sent, uint balance);
  event EmergencyExit(address sender, uint amount);
  event ManualClaim(address sender);
  event InvestAll(uint balance);
  event DepositToPool(uint amount);
  event WithdrawFromPool(uint amount);
  event WithdrawAllFromPool(uint amount);
  event Claimed(address token, uint amount);
  event CompoundRatioChanged(uint oldValue, uint newValue);
  event SentToForwarder(address forwarder, address token, uint amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @notice Initialize contract after setup it as proxy implementation
  function __StrategyBase_init(
    address controller_,
    address _splitter
  ) public onlyInitializing {
    _requireInterface(_splitter, InterfaceIds.I_SPLITTER);
    __Controllable_init(controller_);

    require(IControllable(_splitter).isController(controller_), "SB: Wrong controller");

    asset = ISplitter(_splitter).asset();
    splitter = _splitter;
  }

  // *************************************************************
  //                     RESTRICTIONS
  // *************************************************************

  /// @dev Restrict access only for operators
  function _onlyOperators() internal view {
    require(IController(controller()).isOperator(msg.sender), "SB: Denied");
  }

  /// @dev Restrict access only for splitter
  function _onlySplitter() internal view {
    require(msg.sender == splitter, "SB: Denied");
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Total amount of underlying assets under control of this strategy.
  function totalAssets() public view override returns (uint) {
    return IERC20(asset).balanceOf(address(this)) + investedAssets();
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_STRATEGY_V2 || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                   VOTER ACTIONS
  // *************************************************************

  /// @dev PlatformVoter can change compound ratio for some strategies.
  ///      A strategy can implement another logic for some uniq cases.
  function setCompoundRatio(uint value) external virtual override {
    require(msg.sender == IController(controller()).platformVoter(), "SB: Denied");
    require(value <= COMPOUND_DENOMINATOR, "SB: Too high");
    emit CompoundRatioChanged(compoundRatio, value);
    compoundRatio = value;
  }

  // *************************************************************
  //                   OPERATOR ACTIONS
  // *************************************************************

  /// @dev In case of any issue operator can withdraw all from pool.
  function emergencyExit() external {
    _onlyOperators();

    _emergencyExitFromPool();

    address _asset = asset;
    uint balance = IERC20(_asset).balanceOf(address(this));
    IERC20(_asset).safeTransfer(splitter, balance);
    emit EmergencyExit(msg.sender, balance);
  }

  /// @dev Manual claim rewards.
  function claim() external {
    _onlyOperators();

    _claim();
    emit ManualClaim(msg.sender);
  }

  // *************************************************************
  //                    DEPOSIT/WITHDRAW
  // *************************************************************

  /// @dev Stakes everything the strategy holds into the reward pool.
  function investAll() external override {
    _onlySplitter();

    uint balance = IERC20(asset).balanceOf(address(this));
    if (balance > 0) {
      _depositToPool(balance);
    }
    emit InvestAll(balance);
  }

  /// @dev Withdraws all underlying assets to the vault
  function withdrawAllToSplitter() external override {
    _onlySplitter();

    _withdrawAllFromPool();

    address _asset = asset;
    uint balance = IERC20(_asset).balanceOf(address(this));
    IERC20(_asset).safeTransfer(splitter, balance);
    emit WithdrawAllToSplitter(balance);
  }

  /// @dev Withdraws some assets to the splitter
  function withdrawToSplitter(uint amount) external override {
    _onlySplitter();

    address _asset = asset;

    uint balance = IERC20(_asset).balanceOf(address(this));
    if (amount > balance) {
      _withdrawFromPool(amount - balance);
    }

    balance = IERC20(_asset).balanceOf(address(this));
    uint amountAdjusted = Math.min(amount, balance);
    if (amountAdjusted != 0) {
      IERC20(_asset).safeTransfer(splitter, amountAdjusted);
    }
    emit WithdrawToSplitter(amount, amountAdjusted, balance);
  }

  // *************************************************************
  //                       HELPERS
  // *************************************************************

  /// @dev Must use this function for any transfers to Forwarder.
  function _sendToForwarder(address token, uint amount) internal {
    address forwarder = IController(controller()).forwarder();
    IERC20(token).safeTransfer(forwarder, amount);
    IForwarder(forwarder).distribute(token);
    emit SentToForwarder(forwarder, token, amount);
  }

  // *************************************************************
  //                       VIRTUAL
  // These functions must be implemented in the strategy contract
  // *************************************************************

  /// @dev Amount of underlying assets invested to the pool.
  function investedAssets() public view virtual returns (uint);

  /// @dev Deposit given amount to the pool.
  function _depositToPool(uint amount) internal virtual;

  /// @dev Withdraw given amount from the pool.
  function _withdrawFromPool(uint amount) internal virtual;

  /// @dev Withdraw all from the pool.
  function _withdrawAllFromPool() internal virtual;

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  function _emergencyExitFromPool() internal virtual;

  /// @dev Claim all possible rewards.
  function _claim() internal virtual;

}
