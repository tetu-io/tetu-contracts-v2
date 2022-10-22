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
  /// @return borrowedAmountOut Exact borrowed amount transferred to {receiver_}
  function borrow(
    address converter_,
    address collateralAsset_,
    uint collateralAmount_,
    address borrowAsset_,
    uint amountToBorrow_,
    address receiver_
  ) external returns (
    uint borrowedAmountOut
  );

  /// @notice Full or partial repay of the borrow
  /// @dev A user should transfer {amountToRepay_} to TetuConverter before calling repay()
  /// @param amountToRepay_ Amount of borrowed asset to repay.
  ///                       You can know exact total amount of debt using {getStatusCurrent}.
  ///                       if the amount exceed total amount of the debt:
  ///                       - the debt will be fully repaid
  ///                       - remain amount will be swapped from {borrowAsset_} to {collateralAsset_}
  /// @param receiver_ A receiver of the collateral that will be withdrawn after the repay
  ///                  The remained amount of borrow asset will be returned to the {receiver_} too
  /// @return collateralAmountOut Exact collateral amount transferred to {collateralReceiver_}
  /// @return returnedBorrowAmountOut A part of amount-to-repay that wasn't converted to collateral asset
  ///                                 because of any reasons (i.e. there is no available conversion strategy)
  ///                                 This amount is returned back to the collateralReceiver_
  function repay(
    address collateralAsset_,
    address borrowAsset_,
    uint amountToRepay_,
    address receiver_
  ) external returns (
    uint collateralAmountOut,
    uint returnedBorrowAmountOut
  );

  /// @notice Update status in all opened positions
  ///         and calculate exact total amount of borrowed and collateral assets
  function getStatusCurrent(
    address collateralAsset_,
    address borrowAsset_
  ) external returns (uint totalDebtAmountOut, uint totalCollateralAmountOut);

  /// @notice Total amount of borrow tokens that should be repaid to close the borrow completely.
  /// @dev Actual debt amount can be a little LESS then the amount returned by this function.
  ///      I.e. AAVE's pool adapter returns (amount of debt + tiny addon ~ 1 cent)
  ///      The addon is required to workaround dust-tokens problem.
  ///      After repaying the remaining amount is transferred back on the balance of the caller strategy.
  function getDebtAmount(
    address collateralAsset_,
    address borrowAsset_
  ) external view returns (uint totalDebtAmountOut, uint totalCollateralAmountOut);

  /// @notice User needs to redeem some collateral amount. Calculate an amount of borrow token that should be repaid
  /// @param collateralAmountRequired_ Amount of collateral required by the user
  /// @return borrowAssetAmount Borrowed amount that should be repaid to receive back following amount of collateral:
  ///                           amountToReceive = collateralAmountRequired_ - unobtainableCollateralAssetAmount
  /// @return unobtainableCollateralAssetAmount A part of collateral that cannot be obtained in any case
  ///                                           even if all borrowed amount will be returned.
  ///                                           If this amount is not 0, you ask to get too much collateral.
  function estimateRepay(
    address collateralAsset_,
    uint collateralAmountRequired_,
    address borrowAsset_
  ) external view returns (
    uint borrowAssetAmount,
    uint unobtainableCollateralAssetAmount
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
}
