// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;


import "../interfaces/IMultiSwap2.sol";
import "./MockToken.sol";

contract MockMultiswap is IMultiSwap2 {

  function multiSwap(
    SwapData memory swapData,
    IBVault.BatchSwapStep[] memory /*swaps*/,
    IAsset[] memory /*tokenAddresses*/,
    uint /*slippage*/,
    uint256 /*deadline*/
  ) external payable override returns (uint amountOut) {
    uint amount = swapData.swapAmount;
    IERC20(swapData.tokenIn).transferFrom(msg.sender, swapData.tokenIn, amount);
    MockToken(swapData.tokenOut).mint(msg.sender, amount);
    return amount;
  }

}
