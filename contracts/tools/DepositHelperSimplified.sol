// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IERC4626.sol";
import "../interfaces/IERC20.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../interfaces/IBVault.sol";

contract DepositHelperSimplified is ReentrancyGuard {
  using SafeERC20 for IERC20;

  /// @notice OneInch, OpenOcean, etc
  address public immutable router;

  constructor(address _router) {
    require(_router != address(0), "WRONG_INPUT");
    router = _router;
  }

  /// @dev Proxy deposit action for keep approves on this contract
  function deposit(address vault, address asset, uint amount, uint minSharesOut) public nonReentrant returns (uint) {
    IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    _approveIfNeeds(asset, amount, vault);
    uint sharesOut = IERC4626(vault).deposit(amount, msg.sender);
    require(sharesOut >= minSharesOut, "SLIPPAGE");

    _sendRemainingToken(asset);
    return sharesOut;
  }

  function withdraw(
    address vault,
    uint shareAmount,
    uint minAmountOut
  ) external nonReentrant returns (uint) {
    uint amountOut = IERC4626(vault).redeem(shareAmount, msg.sender, msg.sender);
    require(amountOut >= minAmountOut, "SLIPPAGE");

    _sendRemainingToken(vault);
    return amountOut;
  }

  /// @dev Convert input token to output token and deposit.
  ///      tokenOut should be vault asset
  function convertAndDeposit(
    bytes memory swapData,
    address tokenIn,
    uint amountIn,
    address vault,
    uint minSharesOut
  ) external nonReentrant returns (uint) {
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

    _approveIfNeeds(tokenIn, amountIn, router);
    (bool success,bytes memory result) = router.call(swapData);
    require(success, string(result));

    address asset = address(IERC4626(vault).asset());
    uint balance = IERC20(asset).balanceOf(address(this));

    require(balance != 0, "Zero result balance");
    _approveIfNeeds(asset, balance, vault);
    uint sharesOut = IERC4626(vault).deposit(balance, msg.sender);
    require(sharesOut >= minSharesOut, "SLIPPAGE");

    _sendRemainingToken(tokenIn);
    _sendRemainingToken(asset);
    return sharesOut;
  }

  /// @dev Withdraw from given vault and convert assets to tokenOut
  ///      tokenIn should be vault asset
  function withdrawAndConvert(
    address vault,
    uint shareAmount,
    bytes memory swapData,
    address tokenOut,
    uint minAmountOut
  ) external nonReentrant returns (uint) {
    uint amountIn = IERC4626(vault).redeem(shareAmount, address(this), msg.sender);

    address asset = address(IERC4626(vault).asset());
    _approveIfNeeds(asset, amountIn, router);
    (bool success,) = router.call(swapData);
    require(success, "Swap error");

    uint balance = IERC20(tokenOut).balanceOf(address(this));
    require(balance != 0, "Zero result balance");
    require(balance >= minAmountOut, "SLIPPAGE");
    IERC20(tokenOut).safeTransfer(msg.sender, balance);

    _sendRemainingToken(vault);
    _sendRemainingToken(asset);
    return balance;
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

  function _sendRemainingToken(address token) internal {
    uint balance = IERC20(token).balanceOf(address(this));
    if (balance != 0) {
      IERC20(token).safeTransfer(msg.sender, balance);
    }
  }
}
