// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../interfaces/ITetuLiquidator.sol";
import "../interfaces/ITetuConverter.sol";
import "../interfaces/ITetuConverterCallback.sol";
import "../interfaces/IERC20.sol";
import "../openzeppelin/SafeERC20.sol";
import "./StrategyBaseV2.sol";
import "./DepositorBase.sol";

/// @title Abstract contract for base Converter strategy functionality
/// @notice All depositor assets must be correlated (ie USDC/USDT/DAI)
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

  uint private constant LIQUIDATION_SLIPPAGE = 5_000; // 5%

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Amount of underlying assets invested to the pool.
  uint private _investedAssets;

  /// @dev Linked Tetu Converter
  ITetuConverter public tetuConverter;

  /// @dev Linked Tetu Liquidator
  ITetuLiquidator public tetuLiquidator;

  bool private _isReadyToHardWork;

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
    _isReadyToHardWork = true;

  }

  // *************************************************************
  //                     RESTRICTIONS
  // *************************************************************

  /// @dev Restrict access only for splitter
  function _onlyTetuConverter() internal view {
    require(msg.sender == address(tetuConverter), "CSB: Only TetuConverter");
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

  /// @dev Amount of underlying assets converted to pool assets and invested to the pool.
  function investedAssets() override public view virtual returns (uint) {
    return _investedAssets;
  }

  /// @dev Deposit given amount to the pool.
  function _depositToPool(uint amount) override internal virtual {
    _doHardWork(false);
    if (amount == 0) return;

    address _asset = asset;
    uint assetBalanceBefore = _balance(_asset);

    address[] memory tokens = _depositorPoolAssets();
    uint len = tokens.length;
    uint[] memory tokenAmounts = new uint[](len);
    uint assetAmountForToken = amount / len;

    for (uint i = 0; i < len; ++i) {
      address token = tokens[i];
      if (token == _asset) {
        tokenAmounts[i] = assetAmountForToken;
      } else {
        uint tokenBalance = _balance(token);

        if (tokenBalance >= assetAmountForToken) { // we already have enough tokens
          tokenAmounts[i] = tokenBalance;

        } else { // we do not have enough tokens - borrow
         _openPosition(_asset, assetAmountForToken - tokenBalance, token, ITetuConverter.ConversionMode.AUTO_0);
          tokenAmounts[i] = _balance(token);
        }
      }
    }

    _depositorEnter(tokenAmounts);
    _investedAssets += (assetBalanceBefore - _balance(_asset));
  }

  /// @dev Withdraw given amount from the pool.
  function _withdrawFromPoolUniversal(uint amount, bool emergency) internal {
    if (amount == 0) return;

    if (!emergency) _doHardWork(false);

    address _asset = asset;
    uint assetBalanceBefore = _balance(_asset);

    if (emergency) {
      _depositorEmergencyExit();
    } else {
      uint liquidityAmount = amount * _depositorLiquidity() / _investedAssets;
      _depositorExit(liquidityAmount);
    }

    address[] memory tokens = _depositorPoolAssets();
    uint len = tokens.length;

    for (uint i = 0; i < len; ++i) {
      address borrowedToken = tokens[i];
      if (_asset != borrowedToken) {
        _closePosition(_asset, borrowedToken, _balance(borrowedToken));
      }
    }

    uint amountReceived = _balance(_asset) - assetBalanceBefore;
    _investedAssets -= amountReceived;

  }

  /// @dev Withdraw given amount from the pool.
  function _withdrawFromPool(uint amount) override internal virtual {
    _withdrawFromPoolUniversal(amount, false);
  }

  /// @dev Withdraw all from the pool.
  function _withdrawAllFromPool() override internal virtual {
    _withdrawFromPoolUniversal(_investedAssets, false);
  }

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  function _emergencyExitFromPool() override internal virtual {
    _withdrawFromPoolUniversal(_investedAssets, true);
  }


  function _recycle(address[] memory tokens, uint[] memory amounts) internal {
    require(tokens.length == amounts.length, "SB: Arrays mismatch");
    uint len = tokens.length;

    for (uint i = 0; i < len; ++i) {
      address token = tokens[i];
      uint amount = amounts[i];

      if (amount > 0) {
        uint amountToCompound = amount * compoundRatio / COMPOUND_DENOMINATOR;
        if (amountToCompound > 0) {
          tetuLiquidator.liquidate(token, asset, amountToCompound, LIQUIDATION_SLIPPAGE);
        }

        uint amountToForward = amount - amountToCompound;
        if (amountToForward > 0) {
          _sendToForwarder(token, amount);
        }
      }
    }
  }

  /// @dev Claim all possible rewards.
  function _claim() override internal virtual {
    address[] memory tokens;
    uint[] memory amounts;

    (tokens, amounts) = _depositorClaimRewards();
    _recycle(tokens, amounts);

    (tokens, amounts) = tetuConverter.claimRewards(address(this));
    _recycle(tokens, amounts);
  }

  /// @dev Is strategy ready to hard work
  function isReadyToHardWork()
  override external view returns (bool) {
    return _isReadyToHardWork;
  }

  /// @dev Do hard work
  function doHardWork()
  override external returns (uint earned, uint lost) {
    return _doHardWork(true);
  }

  /// @dev Do hard work
  function _doHardWork(bool doDepositToPool)
  internal returns (uint earned, uint lost) {

    uint assetBalanceBefore = _balance(asset);
    _claim();
    earned = _balance(asset) - assetBalanceBefore;

    if (doDepositToPool) {
      _depositToPool(_balance(asset));
    }

    lost = 0; // TODO

  }

  // *************************************************************
  //               OVERRIDES ITetuConverterCallback
  // *************************************************************


  function requireAmountBack (
    address collateralAsset_,
    address /*borrowAsset_*/,
    uint /*requiredAmountBorrowAsset_*/,
    uint requiredAmountCollateralAsset_
  ) external override returns (
    uint amountOut,
    bool isCollateral
  ) {
    _onlyTetuConverter();
    require(collateralAsset_ == asset, 'CSB: Wrong asset');

    amountOut = 0;
    uint assetBalance = _balance(collateralAsset_);

    if (assetBalance >=  requiredAmountCollateralAsset_) {
      amountOut = requiredAmountCollateralAsset_;

    } else {
      _withdrawFromPool(requiredAmountCollateralAsset_ - assetBalance);
      amountOut = _balance(collateralAsset_);
    }

    IERC20(collateralAsset_).safeTransfer(address(tetuConverter), amountOut);
    isCollateral = true;
  }

  function onTransferBorrowedAmount (
    address /*collateralAsset_*/,
    address /*borrowAsset_*/,
    uint /*amountBorrowAssetSentToBorrower_*/
  ) override pure external {
    revert('CSB: Not implemented');
  }


  // *************************************************************
  //                        HELPERS
  // *************************************************************

  function _balance(address token) internal view returns (uint) {
    return IERC20(token).balanceOf(address(this));
  }

/*  function _approveIfNeeded(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }*/

  function _openPosition(
    address collateralAsset,
    uint collateralAmount,
    address borrowAsset,
    ITetuConverter.ConversionMode conversionMode
  ) internal returns (uint borrowedAmount) {
    (
      address converter,
      uint maxTargetAmount,
      /*int aprForPeriod36*/
    ) = tetuConverter.findConversionStrategy(
      collateralAsset, collateralAmount, borrowAsset, _LOAN_PERIOD_IN_BLOCKS, conversionMode);

    IERC20(collateralAsset).safeTransfer(address(tetuConverter), collateralAmount);

    borrowedAmount = tetuConverter.borrow(
      converter, collateralAsset, collateralAmount, borrowAsset, maxTargetAmount, address(this));
  }

  function _estimateRepay(
    address collateralAsset_,
    uint collateralAmountRequired_,
    address borrowAsset_
  ) internal view returns (
    uint borrowAssetAmount,
    uint unobtainableCollateralAssetAmount
  ){
    return tetuConverter.estimateRepay(collateralAsset_, collateralAmountRequired_, borrowAsset_);
  }

  function _closePosition(address collateralAsset, address borrowAsset, uint amountToRepay)
  internal returns (uint returnedAssetAmount) {
    IERC20(borrowAsset).safeTransfer(address(tetuConverter), amountToRepay);
    uint unobtainableCollateralAssetAmount;
    (returnedAssetAmount, unobtainableCollateralAssetAmount) = tetuConverter.repay(
      collateralAsset, borrowAsset, amountToRepay, address(this)
    );
    require(unobtainableCollateralAssetAmount == 0, 'CSB: Can not convert back');

  }


}
