// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

/// @notice Main contract of the TetuConverter application
/// @dev Borrower (strategy) makes all operations via this contract only.
interface ITetuConverter {
  /// @notice Allow to select conversion kind (swap, borrowing) automatically or manually
  enum ConversionMode {
    AUTO_0,
    SWAP_1,
    BORROW_2
  }

  /// @notice Find best conversion strategy (swap or borrow) and provide "cost of money" as interest for the period
  /// @param sourceAmount_ Amount to be converted
  /// @param periodInBlocks_ Estimated period to keep target amount. It's required to compute APR
  /// @param conversionMode Allow to select conversion kind (swap, borrowing) automatically or manually
  /// @return converter Result contract that should be used for conversion; it supports IConverter
  ///                   This address should be passed to borrow-function during conversion.
  /// @return maxTargetAmount Max available amount of target tokens that we can get after conversion
  /// @return aprForPeriod36 Interest on the use of {outMaxTargetAmount} during the given period, decimals 36
  function findConversionStrategy(
    address sourceToken_,
    uint sourceAmount_,
    address targetToken_,
    uint periodInBlocks_,
    ConversionMode conversionMode
  ) external view returns (
    address converter,
    uint maxTargetAmount,
    int aprForPeriod36
  );

  /// @notice Convert {collateralAmount_} to {amountToBorrow_} using {converter_}
  ///         Target amount will be transferred to {receiver_}. No re-balancing here.
  /// @dev Transferring of {collateralAmount_} by TetuConverter-contract must be approved by the caller before the call
  /// @param converter_ A converter received from findBestConversionStrategy.
  /// @param collateralAmount_ Amount of {collateralAsset_}. This amount must be approved for TetuConverter.
  /// @param amountToBorrow_ Amount of {borrowAsset_} to be borrowed and sent to {receiver_}
  /// @param receiver_ A receiver of borrowed amount
  /// @return borrowedAmountTransferred Exact borrowed amount transferred to {receiver_}
  function borrow(
    address converter_,
    address collateralAsset_,
    uint collateralAmount_,
    address borrowAsset_,
    uint amountToBorrow_,
    address receiver_
  ) external returns (
    uint borrowedAmountTransferred
  );

  /// @notice Full or partial repay of the borrow
  /// @dev We use converter address, not pool adapter, to make set of params in borrow/repay similar
  /// @param amountToRepay_ Amount of borrowed asset to repay. Pass type(uint).max to make full repayment.
  /// @param collateralReceiver_ A receiver of the collateral that will be withdrawn after the repay
  /// @return collateralAmountTransferred Exact collateral amount transferred to {collateralReceiver_}
  function repay(
    address collateralAsset_,
    address borrowAsset_,
    uint amountToRepay_,
    address collateralReceiver_
  ) external returns (
    uint collateralAmountTransferred
  );

  /// @notice Total amount of borrow tokens that should be repaid to close the borrow completely.
  function getDebtAmount(
    address collateralAsset_,
    address borrowAsset_
  ) external view returns (uint);

  /// @notice User needs to redeem some collateral amount. Calculate an amount of borrow token that should be repaid
  function estimateRepay(
    address collateralAsset_,
    uint collateralAmountRequired_,
    address borrowAsset_
  ) external view returns (
    uint borrowAssetAmount
  );

  /// @notice Transfer all reward tokens to {receiver_}
  /// @return rewardTokens What tokens were transferred. Same reward token can appear in the array several times
  /// @return amounts Amounts of transferred rewards, the array is synced with {rewardTokens}
  function claimRewards(address receiver_) external returns (
    address[] memory rewardTokens,
    uint[] memory amounts
  );



  //////////////////////////////////////////////////////////////////////////////
  /// Additional functions, remove somewhere?
  //////////////////////////////////////////////////////////////////////////////

  /// @notice Get active borrow positions for the given collateral/borrowToken
  /// @return poolAdapters An instance of IPoolAdapter (with repay function)
  function findBorrows (
    address collateralToken_,
    address borrowedToken_
  ) external view returns (
    address[] memory poolAdapters
  );

  /// @notice Repay the borrow completely and re-convert (borrow or swap) from zero
  /// @dev Revert if re-borrow uses same PA as before
  /// @param poolAdapter_ TODO: current implementation assumes, that the borrower directly works with pool adapter -
  ///                     TODO: gets status, transfers borrowed amount on balance of the pool adapter and so on
  ///                     TODO: probably we need to hide all pool-adapter-implementation details behind
  ///                     TODO: interface of the TetuConverter in same way as it was done for borrow/repay
  /// @param periodInBlocks_ Estimated period to keep target amount. It's required to compute APR
  function reconvert(
    address poolAdapter_,
    uint periodInBlocks_,
    address receiver_
  ) external;
}
