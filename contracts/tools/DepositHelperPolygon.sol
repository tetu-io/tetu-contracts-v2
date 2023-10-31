// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./DepositHelperAbstract.sol";


contract DepositHelperPolygon is DepositHelperAbstract {
  using SafeERC20 for IERC20;

  address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  bytes32 public constant BALANCER_POOL_ID = 0xe2f706ef1f7240b803aae877c9c762644bb808d80002000000000000000008c2; // poolId of 80TETU-20USDC
  address public constant BALANCER_POOL_TOKEN = 0xE2f706EF1f7240b803AAe877C9C762644bb808d8; // 80TETU-20USDC
  address public constant ASSET0 = 0x255707B70BF90aa112006E1b07B9AeA6De021424; // TETU
  address public constant ASSET1 = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174; // USDC

  constructor(address _oneInchRouter) DepositHelperAbstract(_oneInchRouter) {
  }

  function _convertToVeTetuLpUnderlying(
    bytes memory asset0SwapData,
    bytes memory asset1SwapData,
    address tokenIn,
    uint amountIn
  ) internal override returns (uint bptBalance, address pool){
    address asset0 = ASSET0;
    address asset1 = ASSET1;
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

    _approveIfNeeds(tokenIn, amountIn, oneInchRouter);
    if (tokenIn != asset0) {
      (bool success,bytes memory result) = oneInchRouter.call(asset0SwapData);
      require(success, string(result));
    }

    if (tokenIn != asset1) {
      (bool success,bytes memory result) = oneInchRouter.call(asset1SwapData);
      require(success, string(result));
    }

    // add liquidity
    _joinBalancerPool(BALANCER_VAULT, BALANCER_POOL_ID, ASSET0, ASSET1, IERC20(ASSET0).balanceOf(address(this)), IERC20(ASSET1).balanceOf(address(this)));

    _sendRemainingToken(tokenIn);
    _sendRemainingToken(ASSET0);
    _sendRemainingToken(ASSET1);

    bptBalance = IERC20(BALANCER_POOL_TOKEN).balanceOf(address(this));
    pool = BALANCER_POOL_TOKEN;
  }

}
