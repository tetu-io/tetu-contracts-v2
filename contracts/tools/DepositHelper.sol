// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IERC4626.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IMultiSwap2.sol";
import "../openzeppelin/SafeERC20.sol";

contract DepositHelper {
  using SafeERC20 for IERC20;

  address public immutable multiSwap;

  constructor(address _multiSwap) {
    multiSwap = _multiSwap;
  }

  /// @dev Proxy deposit action for keep approves on this contract
  function deposit(address vault, address asset, uint amount) public {
    IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    _approveIfNeeds(asset, amount, vault);
    IERC4626(vault).deposit(amount, msg.sender);
  }

  /// @dev Convert input token to output token and deposit.
  ///      tokenOut should be vault asset
  function convertAndDeposit(
    address vault,
    IMultiSwap2.SwapData memory swapData,
    IBVault.BatchSwapStep[] memory swaps,
    IAsset[] memory tokenAddresses,
    uint slippage,
    uint deadline
  ) external {
    IERC20(swapData.tokenIn).safeTransferFrom(msg.sender, address(this), swapData.swapAmount);

    _approveIfNeeds(swapData.tokenIn, swapData.swapAmount, multiSwap);
    IMultiSwap2(multiSwap).multiSwap(
      swapData,
      swaps,
      tokenAddresses,
      slippage,
      deadline
    );

    uint balance = IERC20(swapData.tokenOut).balanceOf(address(this));
    _approveIfNeeds(swapData.tokenOut, balance, vault);
    IERC4626(vault).deposit(balance, msg.sender);
  }

  /// @dev Withdraw from given vault and convert assets to tokenOut
  ///      tokenIn should be vault asset
  function withdrawAndConvert(
    address vault,
    uint shareAmount,
    IMultiSwap2.SwapData memory swapData,
    IBVault.BatchSwapStep[] memory swaps,
    IAsset[] memory tokenAddresses,
    uint slippage,
    uint deadline
  ) external {
    uint amountIn = IERC4626(vault).redeem(shareAmount, address(this), msg.sender);
    swapData.swapAmount = amountIn;

    _approveIfNeeds(swapData.tokenIn, amountIn, multiSwap);
    IMultiSwap2(multiSwap).multiSwap(
      swapData,
      swaps,
      tokenAddresses,
      slippage,
      deadline
    );

    uint balance = IERC20(swapData.tokenOut).balanceOf(address(this));
    IERC20(swapData.tokenOut).safeTransfer(msg.sender, balance);
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

}
