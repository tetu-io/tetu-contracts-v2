// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../interfaces/ITetuConverter.sol";
import "../interfaces/ITetuConverterCallback.sol";
import "../interfaces/IERC20.sol";
import "../openzeppelin/SafeERC20.sol";
import "../lib/FixedPointMathLib.sol";
import "./IMockToken.sol";

/// @title Mock contract for Tetu Converter.
/// @author bogdoslav
contract MockTetuConverter is ITetuConverter {
  using SafeERC20 for IERC20;
  using FixedPointMathLib for uint;

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant TETU_CONVERTER_MOCK_VERSION = "1.0.0";

  int public currentAprForPeriod36 = 0;
  uint public borrowRate2 = 50;

  address[] public rewardTokens;
  uint[] public rewardAmounts;

  // msg.sender, collateral, borrow token
  mapping (address => mapping (address => mapping (address => uint))) public collaterals;
  mapping (address => mapping (address => mapping (address => uint))) public debts;

  constructor(address[] memory rewardTokens_, uint[] memory rewardAmounts_) {
    require(rewardTokens_.length == rewardAmounts_.length);

    for (uint i = 0; i < rewardTokens_.length; ++i) {
      rewardTokens.push(rewardTokens_[i]);
      rewardAmounts.push(rewardAmounts_[i]);
    }
  }

  /// SETTERS

  function setCurrentAprForPeriod36(int aprForPeriod36_) external {
    currentAprForPeriod36 = aprForPeriod36_;
  }

  function setBorrowRate2(uint borrowRate2_) external {
    borrowRate2 = borrowRate2_;
  }

  // Math

  function calcMaxTargetAmount(uint conversionModeId, uint sourceAmount_)
  internal view returns (uint maxTargetAmount) {
    if (conversionModeId == uint(ConversionMode.SWAP_1)) {
      maxTargetAmount = uint(int(sourceAmount_) - (int(sourceAmount_) * currentAprForPeriod36) / (10**36 * 2));

    } else if (conversionModeId == uint(ConversionMode.BORROW_2)) {
      maxTargetAmount = sourceAmount_ * borrowRate2 / 10**2 ;

    } else revert('MTC: Wrong conversionMode');
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
  ) override external view returns (
    address converter,
    uint maxTargetAmount,
    int aprForPeriod36
  ) {
    // just use BORROW mode for all AUTO requests for now
    if (conversionMode == ConversionMode.AUTO_0) conversionMode = ConversionMode.BORROW_2;
    // put conversion mode to converter just to detect it at borrow()
    converter = address(uint160(conversionMode));
    maxTargetAmount = calcMaxTargetAmount(uint(conversionMode), sourceAmount_);
    aprForPeriod36 = currentAprForPeriod36;
  }

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
  ) override external returns (
    uint borrowedAmountTransferred
  ) {
    // transfer (that checks allowance)
    IMockToken(collateralAsset_).burn(address(this), collateralAmount_);

    uint maxTargetAmount = calcMaxTargetAmount(uint160(converter_), collateralAmount_);

    if (uint160(converter_) == uint160(ConversionMode.SWAP_1)) {
      borrowedAmountTransferred = maxTargetAmount;

    } else if (uint160(converter_) == uint160(ConversionMode.BORROW_2)) {
      require(amountToBorrow_ <= maxTargetAmount, 'MTC: amountToBorrow too big');
      borrowedAmountTransferred = amountToBorrow_;
      collaterals[msg.sender][collateralAsset_][borrowAsset_] += collateralAmount_;
      debts[msg.sender][collateralAsset_][borrowAsset_] += borrowedAmountTransferred;

    } else revert('MTC: Wrong conversionMode');

    IMockToken(borrowAsset_).mint(msg.sender, borrowedAmountTransferred);

  }

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
  ) override external returns (
    uint collateralAmountTransferred,
    uint returnedBorrowAmountOut
  ) {
    collateralAmountTransferred = 0;
    uint debt = debts[msg.sender][collateralAsset_][borrowAsset_];

    if (amountToRepay_ >= debt) { // close full debt
      delete debts[msg.sender][collateralAsset_][borrowAsset_];
      collateralAmountTransferred = collaterals[msg.sender][collateralAsset_][borrowAsset_];
      delete collaterals[msg.sender][collateralAsset_][borrowAsset_];
      // swap excess
      uint excess = amountToRepay_ - debt;
      if (excess > 0) {
        collateralAmountTransferred += calcMaxTargetAmount(uint(ConversionMode.SWAP_1), excess);
      }

    } else { // partial repay
      debts[msg.sender][collateralAsset_][borrowAsset_] -= amountToRepay_;
      collateralAmountTransferred += calcMaxTargetAmount(uint(ConversionMode.BORROW_2), amountToRepay_);
      collaterals[msg.sender][collateralAsset_][borrowAsset_] -= collateralAmountTransferred;
    }

    IMockToken(borrowAsset_).burn(address(this), amountToRepay_);
    IMockToken(collateralAsset_).mint(collateralReceiver_, collateralAmountTransferred);
    returnedBorrowAmountOut = 0; // stub
  }

  /// @notice Total amount of borrow tokens that should be repaid to close the borrow completely.
  function getDebtAmount(
    address collateralAsset_,
    address borrowAsset_
  ) override external view returns (uint totalDebtAmountOut, uint totalCollateralAmountOut) {
    totalDebtAmountOut = debts[msg.sender][collateralAsset_][borrowAsset_];
    totalCollateralAmountOut = collaterals[msg.sender][collateralAsset_][borrowAsset_];
  }

  /// @notice User needs to redeem some collateral amount. Calculate an amount of borrow token that should be repaid
  function estimateRepay(
    address collateralAsset_,
    uint collateralAmountRequired_,
    address borrowAsset_
  ) override external view returns (
    uint borrowAssetAmount,
    uint unobtainableCollateralAssetAmount
  ) {
    borrowAssetAmount = collateralAmountRequired_.mulDivUp(borrowRate2, 100); // TODO apply apr
    unobtainableCollateralAssetAmount = 0; // stub for now

  }

  /// @notice Transfer all reward tokens to {receiver_}
  /// @return rewardTokens What tokens were transferred. Same reward token can appear in the array several times
  /// @return amounts Amounts of transferred rewards, the array is synced with {rewardTokens}
  function claimRewards(address receiver_) override external returns (
    address[] memory rewardTokens,
    uint[] memory amounts
  ) {
    uint len = rewardTokens.length;
    for (uint i = 0; i < len; ++i) {
      IMockToken token = IMockToken(rewardTokens[i]);
      uint amount = rewardAmounts[i];
      token.mint(receiver_, amount);
    }
    return (rewardTokens, rewardAmounts);
  }

  ////////////////////////
  ///     CALLBACKS
  ////////////////////////

  /// @notice TetuConverter calls this function when it needs to return some borrowed amount back
  ///         i.e. for re-balancing or re-conversion
  /// @param collateralAsset_ Collateral asset of the borrow to identify the borrow on the borrower's side
  /// @param borrowAsset_ Borrow asset of the borrow to identify the borrow on the borrower's side
  /// @param amountToReturn_ What amount of borrow asset the Borrower should send back to TetuConverter
  /// @return amountBorrowAssetReturned Exact amount that borrower has sent to balance of TetuConverter
  ///                                   It should be equal to amountToReturn_
  function callRequireBorrowedAmountBack (
    address borrower,
    address collateralAsset_,
    address borrowAsset_,
    uint amountToReturn_
  ) external returns (uint amountBorrowAssetReturned) {
    uint amountBefore = IERC20(borrowAsset_).balanceOf(address(this));
    uint returned = ITetuConverterCallback(borrower).requireBorrowedAmountBack(
      collateralAsset_, borrowAsset_, amountToReturn_
    );
    uint amountAfter = IERC20(borrowAsset_).balanceOf(address(this));
    amountBorrowAssetReturned = amountAfter - amountBefore;
    require(amountToReturn_ == amountBorrowAssetReturned);
    debts[borrower][collateralAsset_][borrowAsset_] -= amountBorrowAssetReturned;
  }

  /// @notice TetuConverter calls this function when it makes additional borrow (using exist collateral).
  ///         The given amount has already be sent to balance of the user, the user just should use it.
  /// @param collateralAsset_ Collateral asset of the borrow to identify the borrow on the borrower's side
  /// @param borrowAsset_ Borrow asset of the borrow to identify the borrow on the borrower's side
  /// @param amountBorrowAssetSentToBorrower_ This amount has been sent to the borrower's balance
  function callOnTransferBorrowedAmount (
    address borrower,
    address collateralAsset_,
    address borrowAsset_,
    uint amountBorrowAssetSentToBorrower_
  ) external {
    debts[borrower][collateralAsset_][borrowAsset_] += amountBorrowAssetSentToBorrower_;
    IMockToken(borrowAsset_).mint(borrower, amountBorrowAssetSentToBorrower_);

    ITetuConverterCallback(borrower).onTransferBorrowedAmount(
      collateralAsset_, borrowAsset_, amountBorrowAssetSentToBorrower_
    );
  }

  /// @notice Update status in all opened positions
  ///         and calculate exact total amount of borrowed and collateral assets
  function getStatusCurrent(
    address collateralAsset_,
    address borrowAsset_
  ) override external returns (uint totalDebtAmountOut, uint totalCollateralAmountOut) {
    totalDebtAmountOut = 0; // stub
    totalCollateralAmountOut = 0;  // stub
  }


  //////////////////////////////////////////////////////////////////////////////
  /// Additional functions, remove somewhere?
  //////////////////////////////////////////////////////////////////////////////

  function findBorrows (
    address collateralToken_,
    address borrowedToken_
  ) override external view returns (
    address[] memory poolAdapters
  ) {
    poolAdapters = new address[](1);
    poolAdapters[0] = address(uint160(ConversionMode.BORROW_2));
  }



}
