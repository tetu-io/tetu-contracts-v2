// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
//
//import "../interfaces/ITetuConverter.sol";
//import "../openzeppelin/SafeERC20.sol";
//import "./ConverterStrategyBase.sol";
//import "../third_party/tetuswap/ITetuSwapPair.sol";
//import "../third_party/tetuswap/ITetuSwapRouter.sol";
//
///// @title Contract for Tetu base strategy functionality
///// @author bogdoslav
//contract TetuSwapStrategyBase is ConverterStrategyBase {
//  using SafeERC20 for IERC20;
//
//  // *************************************************************
//  //                        CONSTANTS
//  // *************************************************************
//
//  /// @notice Strategy type for statistical purposes
//  string public constant override NAME = "TetuSwapStrategyBase";
//  string public constant override PLATFORM = "TetuSwap";
//  /// @dev Version of this contract. Adjust manually on each code modification.
//  string public constant override STRATEGY_VERSION = "1.0.0";
//
//  // *************************************************************
//  //                        VARIABLES
//  //                Keep names and ordering!
//  //                 Add only in the bottom.
//  // *************************************************************
//
//  /// @notice TetuSwap pair
//  ITetuSwapPair public pair;
//  /// @notice pair token0
//  IERC20 public token0;
//  /// @notice pair token1
//  IERC20 public token1;
//
//  /// @notice Uniswap router for underlying LP
//  ITetuSwapRouter public router;
//
//
//  // *************************************************************
//  //                        INIT
//  // *************************************************************
//
//  /// @notice Initialize contract after setup it as proxy implementation
//  function __TetuSwapStrategyBase_init(
//    address controller_,
//    address splitter_,
//    address converter_,
//    address pair_,
//    address router_
//  ) public onlyInitializing {
//    __ConverterStrategyBase_init(controller_, splitter_, converter_);
//    require(pair_ != address(0), "Zero pair"); // TODO check interface
//    pair = ITetuSwapPair(pair_);
//    require(pair_ != address(0), "Zero router"); // TODO check interface
//    router = ITetuSwapRouter(router_);
//    token0 = pair.token0();
//    token1 = pair.token1();
//  }
//
//
//  // *************************************************************
//  //                       OVERRIDES StrategyBase
//  // *************************************************************
//
//  /// @dev Deposit given amount to the pool.
//  function _depositToPool(uint amount) override internal virtual {
//    // TODO
//    if (amount == 0) return;
//    uint amountFor0 = amount / 2;
//    uint amountFor1 = amount - amountFor0;
//
//    // open position
//    uint amount0 = _openPosition(asset, amountFor0, token0);
//    uint amount1 = _openPosition(asset, amountFor1, token1);
//    // convert amount/2 to token 1
//    _approveIfNeeded(token0, amount0, address(router));
//    _approveIfNeeded(token1, amount1, address(router));
//    router.addLiquidity(token0, token1, amount0, amount1, 0, 0, address(this), block.timestamp);
//  }
//
//  /// @dev Withdraw given amount from the pool.
//  function _withdrawFromPool(uint amount) override internal virtual {
//    // TODO
//  }
//
//  /// @dev Withdraw all from the pool.
//  function _withdrawAllFromPool() override internal virtual {
//    // TODO
//  }
//
//  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
//  function _emergencyExitFromPool() override internal virtual {
//    // TODO
//  }
//
//  /// @dev Claim all possible rewards.
//  function _claim() override internal virtual {
//    pair.claimAll();
//  }
//
//  /// @dev Is strategy ready to hard work
//  function isReadyToHardWork()
//  override external pure returns (bool) {
//    return true; // TODO
//  }
//
//  /// @dev Do hard work
//  function doHardWork()
//  override external pure returns (uint earned, uint lost) {
//    return (0, 0); // TODO
//  }
//
//  // *************************************************************
//  //                       OVERRIDES IBorrower
//  // *************************************************************
//
//  function requireReconversion(address poolAdapter)
//  override external {
//    // TODO
//  }
//
//  function requireRepay(address poolAdapter)
//  override external {
//    // TODO
//  }
//
//}
