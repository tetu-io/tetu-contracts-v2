// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/Math.sol";
import "../interfaces/IController.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/ISplitter.sol";

library StrategyLib {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Denominator for fee calculation.
  uint internal constant FEE_DENOMINATOR = 100_000;

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

  // *************************************************************
  //                        ERRORS
  // *************************************************************

  string internal constant DENIED = "SB: Denied";
  string internal constant TOO_HIGH = "SB: Too high";
  string internal constant WRONG_VALUE = "SB: Wrong value";
  /// @dev Denominator for compound ratio
  uint internal constant COMPOUND_DENOMINATOR = 100_000;

  // *************************************************************
  //                        CHECKS AND EMITS
  // *************************************************************

  function _checkCompoundRatioChanged(address controller, uint oldValue, uint newValue) external {
    onlyPlatformVoter(controller);
    require(newValue <= COMPOUND_DENOMINATOR, TOO_HIGH);
    emit CompoundRatioChanged(oldValue, newValue);
  }

  function _checkStrategySpecificNameChanged(address controller, string calldata newName) external {
    onlyOperators(controller);
    emit StrategySpecificNameChanged(newName);
  }

  function _checkManualClaim(address controller) external {
    onlyOperators(controller);
    emit ManualClaim(msg.sender);
  }

  function _checkInvestAll(address splitter, address asset) external returns (uint assetBalance) {
    onlySplitter(splitter);
    assetBalance = IERC20(asset).balanceOf(address(this));
    emit InvestAll(assetBalance);
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

  function _checkSetupPerformanceFee(address controller, uint fee_, address receiver_) external view {
    onlyGovernance(controller);
    require(fee_ <= 100_000, TOO_HIGH);
    require(receiver_ != address(0), WRONG_VALUE);
  }

  // *************************************************************
  //                       HELPERS
  // *************************************************************

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
