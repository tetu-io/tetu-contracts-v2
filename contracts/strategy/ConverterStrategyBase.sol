// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../interfaces/ITetuConverter.sol";
import "../interfaces/ITetuConverterCallback.sol";
import "../interfaces/IERC20.sol";
import "../openzeppelin/SafeERC20.sol";
import "./StrategyBaseV2.sol";
import "./DepositorBase.sol";

/// @title Abstract contract for base Converter strategy functionality
/// @author bogdoslav
abstract contract ConverterStrategyBase is /*IConverterStrategy,*/DepositorBase,  ITetuConverterCallback, StrategyBaseV2 { // TODO
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant CONVERTER_STRATEGY_BASE_VERSION = "1.0.0";

  // approx one month for average block time 2 sec
  uint private constant _LOAN_PERIOD_IN_BLOCKS = 3600 * 24 * 30 / 2; // TODO check

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Linked Tetu Converter
  ITetuConverter public tetuConverter;

  /// @dev Amount of underlying assets invested to the pool.
  uint private _investedAssets;

  address public pool; // TODO move to IInvestor

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @notice Initialize contract after setup it as proxy implementation
  function __ConverterStrategyBase_init(
    address controller_,
    address splitter_,
    address converter_
  ) public onlyInitializing {
    __StrategyBase_init(controller_, splitter_);
    _requireInterface(converter_, InterfaceIds.I_TETU_CONVERTER);
    tetuConverter = ITetuConverter(converter_);

  }

  // *************************************************************
  //                     RESTRICTIONS
  // *************************************************************

  /// @dev Restrict access only for splitter
  function _onlyTetuConverter() internal view {
    require(msg.sender == address(tetuConverter), "CSB: Denied");
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_CONVERTER_STRATEGY || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                       OVERRIDES StrategyBase
  // *************************************************************

  /// @dev Amount of underlying assets invested to the pool.
  function investedAssets() override public view virtual returns (uint) {
    return _investedAssets;
  }

  /// @dev Deposit given amount to the pool.
  function _depositToPool(uint amount) override internal virtual {
    if (amount == 0) return;

    address[] memory tokens = _depositorPoolTokens();
    uint len = tokens.length;
    uint[] memory tokenAmounts = new uint[](len);
    uint amountForToken = amount / len; // TODO implement weights

    for (uint i = 0; i < len; ++i) {
      tokenAmounts[i] = _openPosition(asset, amountForToken, tokens[i], ITetuConverter.ConversionMode.AUTO_0);
      _approveIfNeeded(tokens[i], amountForToken, pool);
    }

    _depositorEnter(tokenAmounts); // TODO
  }

  /// @dev Withdraw given amount from the pool.
  function _withdrawFromPool(uint amount) override internal virtual {
    // TODO
    // for (tokens) estimate repay
    // _withdrawTokens(tokenAmounts)
    // for (tokens) repay
  }

  /// @dev Withdraw all from the pool.
  function _withdrawAllFromPool() override internal virtual {
    // TODO
  }

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  function _emergencyExitFromPool() override internal virtual {
    // TODO
  }

  /// @dev Claim all possible rewards.
  function _claim() override internal virtual {
    (address[] memory tokens, uint[] memory amounts) = _depositorClaimRewards();
    // TODO send to forwarder
  }

  /// @dev Is strategy ready to hard work
  function isReadyToHardWork()
  override external pure returns (bool) {
    return true; // TODO
  }

  /// @dev Do hard work
  function doHardWork()
  override external pure returns (uint earned, uint lost) {
    return (0, 0); // TODO
  }

  // *************************************************************
  //               OVERRIDES ITetuConverterCallback
  // *************************************************************

  function requireBorrowedAmountBack (
    address collateralAsset_,
    address borrowAsset_,
    uint amountToReturn_
  ) override external returns (uint amountBorrowAssetReturned) {
    _onlyTetuConverter();
    // TODO
    amountBorrowAssetReturned = 0;
  }

  function onTransferBorrowedAmount (
    address collateralAsset_,
    address borrowAsset_,
    uint amountBorrowAssetSentToBorrower_
  ) override external {
    _onlyTetuConverter();
    // TODO
  }


  // *************************************************************
  //                        HELPERS
  // *************************************************************

  function _approveIfNeeded(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

  function _openPosition(
    address collateralAsset,
    uint collateralAmount,
    address borrowAsset,
    ITetuConverter.ConversionMode conversionMode
  ) internal returns (uint borrowedAmount) {
    (
      address converter,
      uint maxTargetAmount,
      int aprForPeriod36
    ) = tetuConverter.findConversionStrategy(
      collateralAsset, collateralAmount, borrowAsset, _LOAN_PERIOD_IN_BLOCKS, conversionMode
    );

    borrowedAmount = tetuConverter.borrow(
      converter, collateralAsset, collateralAmount, borrowAsset, maxTargetAmount, address(this)
    );
  }

  function _closePosition(address collateralAsset, address borrowAsset, uint amountToRepay)
  internal returns (uint returnedAssetAmount) {
    // TODO repay / close position
    returnedAssetAmount = tetuConverter.repay(
      collateralAsset, borrowAsset, amountToRepay, address(this)
    );
  }


}
