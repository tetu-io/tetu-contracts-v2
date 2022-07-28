// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./IBVault.sol";


/// @title Multi Swap 2 Interface
/// @dev Interface to do multiple swaps, based on routes with weights
/// @author bogdoslav
interface IMultiSwap2 {

  struct SwapData {
    address tokenIn;
    address tokenOut;
    uint swapAmount;
    uint returnAmount;
  }

  function multiSwap(
    SwapData memory swapData,
    IBVault.BatchSwapStep[] memory swaps,
    IAsset[] memory tokenAddresses,
    uint slippage,
    uint256 deadline
  )
  external
  payable
  returns (uint amountOut);

}
