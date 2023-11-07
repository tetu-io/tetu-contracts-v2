// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./DepositHelperAbstract.sol";

interface IRouter {
 function addLiquidity(
    address tokenA,
    address tokenB,
    bool stable,
    uint amountADesired,
    uint amountBDesired,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline
  ) external returns (uint amountA, uint amountB, uint liquidity);
}

contract DepositHelperBaseChain is DepositHelperAbstract {
  using SafeERC20 for IERC20;

  address public constant TETU_tUSDbC_AERODROME_LP = 0x924bb74AD42314E4434af5df984cca28b0529337;
  address public constant ASSET0 = 0x5E42c17CAEab64527D9d80d506a3FE01179afa02; // TETU
  address public constant ASSET1 = 0x68f0a05FDc8773d9a5Fd1304ca411ACc234ce22c; // tUSDbC
  IRouter public constant AERODROME_ROUTER = IRouter(0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43);

  constructor(address _oneInchRouter) DepositHelperAbstract(_oneInchRouter) {
  }

  function _convertToVeTetuLpUnderlying(
    bytes memory asset0SwapData,
    bytes memory asset1SwapData,
    address tokenIn,
    uint amountIn
  ) internal override returns (uint lpBalance, address pool){
    pool = TETU_tUSDbC_AERODROME_LP;

    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
    _approveIfNeeds(tokenIn, amountIn, oneInchRouter);

    if (tokenIn != ASSET0) {
      (bool success,bytes memory result) = oneInchRouter.call(asset0SwapData);
      require(success, string(result));
    }

    if (tokenIn != ASSET1) {
      (bool success,bytes memory result) = oneInchRouter.call(asset1SwapData);
      require(success, string(result));
    }

    uint amount0 = IERC20(ASSET0).balanceOf(address(this));
    uint amount1 = IERC20(ASSET1).balanceOf(address(this));

    _approveIfNeeds(ASSET0, amount0, address(AERODROME_ROUTER));
    _approveIfNeeds(ASSET1, amount1, address(AERODROME_ROUTER));

    AERODROME_ROUTER.addLiquidity(
      ASSET0,
      ASSET1,
      false,
      amount0,
      amount1,
      0,
      0,
      address(this),
      block.timestamp
    );

    _sendRemainingToken(tokenIn);
    _sendRemainingToken(ASSET0);
    _sendRemainingToken(ASSET1);


    lpBalance = IERC20(pool).balanceOf(address(this));
  }

}
