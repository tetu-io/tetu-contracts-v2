// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/Math.sol";
import "../interfaces/IController.sol";
import "../interfaces/IControllable.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IStrategyV3.sol";

library StrategyLib2 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Denominator for fee calculation.
  uint internal constant FEE_DENOMINATOR = 100_000;
  /// @notice 10% of total profit is sent to {performanceReceiver} before compounding
  uint internal constant DEFAULT_PERFORMANCE_FEE = 10_000;
  address internal constant DEFAULT_PERF_FEE_RECEIVER = 0x9Cc199D4353b5FB3e6C8EEBC99f5139e0d8eA06b;
  /// @dev Denominator for compound ratio
  uint internal constant COMPOUND_DENOMINATOR = 100_000;

  // *************************************************************
  //                        ERRORS
  // *************************************************************

  string internal constant DENIED = "SB: Denied";
  string internal constant TOO_HIGH = "SB: Too high";
  string internal constant WRONG_VALUE = "SB: Wrong value";

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event CompoundRatioChanged(uint oldValue, uint newValue);
  event StrategySpecificNameChanged(string name);
  event EmergencyExit(address sender, uint amount);
  event ManualClaim(address sender);
  event InvestAll(uint balance);
  event WithdrawAllToSplitter(uint amount);
  event WithdrawToSplitter(uint amount, uint sent, uint balance);
  event PerformanceFeeChanged(uint fee, address receiver, uint ratio);

  // *************************************************************
  //                        CHECKS AND EMITS
  // *************************************************************

  function _checkManualClaim(address controller) external {
    onlyOperators(controller);
    emit ManualClaim(msg.sender);
  }

  function _checkInvestAll(address splitter, address asset) external returns (uint assetBalance) {
    onlySplitter(splitter);
    assetBalance = IERC20(asset).balanceOf(address(this));
    emit InvestAll(assetBalance);
  }

  function _checkSetupPerformanceFee(address controller, uint fee_, address receiver_, uint ratio_) internal {
    onlyGovernance(controller);
    require(fee_ <= FEE_DENOMINATOR, TOO_HIGH);
    require(receiver_ != address(0), WRONG_VALUE);
    require(ratio_ <= FEE_DENOMINATOR, TOO_HIGH);
    emit PerformanceFeeChanged(fee_, receiver_, ratio_);
  }

  // *************************************************************
  //                        SETTERS
  // *************************************************************

  function _changeCompoundRatio(IStrategyV3.BaseState storage baseState, address controller, uint newValue) external {
    onlyPlatformVoter(controller);
    require(newValue <= COMPOUND_DENOMINATOR, TOO_HIGH);

    uint oldValue = baseState.compoundRatio;
    baseState.compoundRatio = newValue;

    emit CompoundRatioChanged(oldValue, newValue);
  }

  function _changeStrategySpecificName(IStrategyV3.BaseState storage baseState, string calldata newName) external {
    baseState.strategySpecificName = newName;
    emit StrategySpecificNameChanged(newName);
  }

  // *************************************************************
  //                     RESTRICTIONS
  // *************************************************************

  /// @dev Restrict access only for operators
  function onlyOperators(address controller) public view {
    require(IController(controller).isOperator(msg.sender), DENIED);
  }

  /// @dev Restrict access only for governance
  function onlyGovernance(address controller) public view {
    require(IController(controller).governance() == msg.sender, DENIED);
  }

  /// @dev Restrict access only for platform voter
  function onlyPlatformVoter(address controller) public view {
    require(IController(controller).platformVoter() == msg.sender, DENIED);
  }

  /// @dev Restrict access only for splitter
  function onlySplitter(address splitter) public view {
    require(splitter == msg.sender, DENIED);
  }

  // *************************************************************
  //                       HELPERS
  // *************************************************************

  function init(
    IStrategyV3.BaseState storage baseState,
    address controller_,
    address splitter_
  ) external {
    baseState.asset = ISplitter(splitter_).asset();
    baseState.splitter = splitter_;
    baseState.performanceReceiver = DEFAULT_PERF_FEE_RECEIVER;
    baseState.performanceFee = DEFAULT_PERFORMANCE_FEE;

    require(IControllable(splitter_).isController(controller_), WRONG_VALUE);
  }

  function setupPerformanceFee(IStrategyV3.BaseState storage baseState, uint fee_, address receiver_, uint ratio_, address controller_) external {
    _checkSetupPerformanceFee(controller_, fee_, receiver_, ratio_);
    baseState.performanceFee = fee_;
    baseState.performanceReceiver = receiver_;
    baseState.performanceFeeRatio = ratio_;
  }

  /// @notice Calculate withdrawn amount in USD using the {assetPrice}.
  ///         Revert if the amount is different from expected too much (high price impact)
  /// @param balanceBefore Asset balance of the strategy before withdrawing
  /// @param expectedWithdrewUSD Expected amount in USD, decimals are same to {_asset}
  /// @param assetPrice Price of the asset, decimals 18
  /// @return balance Current asset balance of the strategy
  function checkWithdrawImpact(
    address _asset,
    uint balanceBefore,
    uint expectedWithdrewUSD,
    uint assetPrice,
    address _splitter
  ) public view returns (uint balance) {
    balance = IERC20(_asset).balanceOf(address(this));
    if (assetPrice != 0 && expectedWithdrewUSD != 0) {

      uint withdrew = balance > balanceBefore ? balance - balanceBefore : 0;
      uint withdrewUSD = withdrew * assetPrice / 1e18;
      uint priceChangeTolerance = ITetuVaultV2(ISplitter(_splitter).vault()).withdrawFee();
      uint difference = expectedWithdrewUSD > withdrewUSD ? expectedWithdrewUSD - withdrewUSD : 0;
      require(difference * FEE_DENOMINATOR / expectedWithdrewUSD <= priceChangeTolerance, TOO_HIGH);
    }
  }

  function sendOnEmergencyExit(address controller, address asset, address splitter) external {
    onlyOperators(controller);

    uint balance = IERC20(asset).balanceOf(address(this));
    IERC20(asset).safeTransfer(splitter, balance);
    emit EmergencyExit(msg.sender, balance);
  }

  function _checkSplitterSenderAndGetBalance(address splitter, address asset) external view returns (uint balance) {
    onlySplitter(splitter);
    return IERC20(asset).balanceOf(address(this));
  }

  function _withdrawAllToSplitterPostActions(
    address _asset,
    uint balanceBefore,
    uint expectedWithdrewUSD,
    uint assetPrice,
    address _splitter
  ) external {
    uint balance = checkWithdrawImpact(
      _asset,
      balanceBefore,
      expectedWithdrewUSD,
      assetPrice,
      _splitter
    );

    if (balance != 0) {
      IERC20(_asset).safeTransfer(_splitter, balance);
    }
    emit WithdrawAllToSplitter(balance);
  }

  function _withdrawToSplitterPostActions(
    uint amount,
    uint balance,
    address _asset,
    address _splitter
  ) external {
    uint amountAdjusted = Math.min(amount, balance);
    if (amountAdjusted != 0) {
      IERC20(_asset).safeTransfer(_splitter, amountAdjusted);
    }
    emit WithdrawToSplitter(amount, amountAdjusted, balance);
  }
}
