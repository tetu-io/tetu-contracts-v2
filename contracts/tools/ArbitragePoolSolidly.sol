// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../openzeppelin/Math.sol";
import "../interfaces/IERC20Metadata.sol";

interface ISolidlyPair {

  function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

  function getReserves() external view returns (uint _reserve0, uint _reserve1, uint32 _blockTimestampLast);

  function getAmountOut(uint, address) external view returns (uint);

  function tokens() external view returns (address, address);

  function factory() external view returns (address);

  function stable() external view returns (bool);
}

interface ISolidlyFactory {
  function getFee(address pool, bool stable) external view returns (uint);
}

contract ArbitragePoolSolidly {

  struct Context {
    ISolidlyPair pool;
    address token0;
    address token1;
    uint reserve0;
    uint reserve1;
    uint currentPoolPrice;
    uint decimals0;
    uint decimals1;
    uint amountForPriceCheck;
    uint targetPrice;
    bool needBuyToken0;
    address tokenIn;
    address tokenOut;
    uint poolFee;
    bool stable;
  }

  string public constant VERSION = "1.0.0";
  uint internal constant PRICE_DIFF_TOLERANCE = 10;

  address public owner;
  address public pendingOwner;
  address public operator;

  address internal _pool;
  uint public amountForPriceCheck = 1e18;

  constructor() {
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "NOT_OWNER");
    _;
  }

  modifier onlyOperator() {
    require(msg.sender == operator || msg.sender == owner, "NOT_OPERATOR");
    _;
  }

  ////////////////// GOV //////////////////////

  function offerOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "ZERO_ADDRESS");
    pendingOwner = newOwner;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingOwner, "NOT_OWNER");
    owner = pendingOwner;
  }

  function setOperator(address operator_) external onlyOwner {
    operator = operator_;
  }

  function setAmountForPriceCheck(uint value) external onlyOwner {
    amountForPriceCheck = value;
  }

  function withdraw(address token, uint amount) external onlyOwner {
    IERC20(token).transfer(msg.sender, amount);
  }

  ////////////////// MAIN LOGIC //////////////////////

  function getCurrentPrice(ISolidlyPair pool) external view returns (uint) {
    Context memory c = createContext(pool, 1);
    return getPoolPriceWithCustomReserves(c, c.reserve0, c.reserve1);
  }

  function getPoolPriceWithCustomReserves(Context memory c, uint reserve0, uint reserve1) public pure returns (uint) {
    return getAmountOut(c, c.amountForPriceCheck, c.token0, reserve0, reserve1) * c.decimals0 / c.amountForPriceCheck;
  }

  function createContext(ISolidlyPair pool, uint targetPrice) public view returns (Context memory) {
    (address token0, address token1) = pool.tokens();
    (uint reserve0, uint reserve1,) = pool.getReserves();
    uint decimals0 = 10 ** IERC20Metadata(token0).decimals();
    uint decimals1 = 10 ** IERC20Metadata(token1).decimals();

    Context memory c = Context({
      pool: pool,
      token0: token0,
      token1: token1,
      reserve0: reserve0,
      reserve1: reserve1,
      currentPoolPrice: 0,
      decimals0: decimals0,
      decimals1: decimals1,
      targetPrice: targetPrice,
      amountForPriceCheck: amountForPriceCheck,
      needBuyToken0: false,
      tokenIn: address(0),
      tokenOut: address(0),
      poolFee: 0,
      stable: pool.stable()
    });

    c.poolFee = ISolidlyFactory(pool.factory()).getFee(address(pool), c.stable);

    c.currentPoolPrice = getPoolPriceWithCustomReserves(c, reserve0, reserve1);
    c.needBuyToken0 = c.currentPoolPrice < targetPrice;

    c.tokenIn = c.needBuyToken0 ? c.token1 : c.token0;
    c.tokenOut = c.needBuyToken0 ? c.token0 : c.token1;
    return c;
  }

  function calculateAmountsForPrice(Context memory c) public pure returns (uint amountIn0, uint amountIn1) {
    if (c.tokenIn == c.token0) {
      amountIn0 = findClosestAmount(c, 1000);
    } else {
      amountIn1 = findClosestAmount(c, 1000);
    }
    return (amountIn0, amountIn1);
  }

  function findClosestAmount(Context memory c, uint min) internal pure returns (uint) {
    uint max = c.tokenIn == c.token0 ? c.reserve0 : c.reserve1;

    for (uint i; i < 128; ++i) {
      if (min >= max) {
        break;
      }
      uint mid = (min + max + 1) / 2;
      uint expectedPrice = getExpectedPrice(c, mid, c.tokenIn);

      if (expectedPrice == c.targetPrice) {
        return mid;
      }
      if (!c.needBuyToken0) {
        if (expectedPrice > c.targetPrice) {
          min = mid;
        } else {
          max = mid - 1;
        }
      } else {
        if (expectedPrice <= c.targetPrice) {
          min = mid;
        } else {
          max = mid - 1;
        }
      }

    }
    return min;
  }

  function getExpectedPrice(Context memory c, uint amountIn, address tokenIn) public pure returns (uint expectedPrice) {
    uint outPrev = getAmountOut(
      c,
      amountIn,
      tokenIn,
      c.reserve0,
      c.reserve1
    );

    uint r0 = c.reserve0 + (tokenIn == c.token0 ? amountIn : 0) - (tokenIn == c.token0 ? 0 : outPrev) - (tokenIn == c.token0 ? amountIn * c.poolFee / 10000 : 0);
    uint r1 = c.reserve1 + (tokenIn == c.token0 ? 0 : amountIn) - (tokenIn == c.token0 ? outPrev : 0) - (tokenIn == c.token0 ? 0 : amountIn * c.poolFee / 10000);

    expectedPrice = getPoolPriceWithCustomReserves(c, r0, r1);
  }

  function arbitrage(ISolidlyPair pool, uint token0ToToken1DesiredPrice) external onlyOperator {
    Context memory c = createContext(pool, token0ToToken1DesiredPrice);

    (uint amountIn0, uint amountIn1) = calculateAmountsForPrice(c);

    uint amountOut0;
    uint amountOut1;
    if (amountIn0 != 0) {
      uint bal = IERC20(c.token0).balanceOf(address(this));
      if (bal < amountIn0) {
        amountIn0 = bal;
      }
      amountOut1 = getAmountOut(c, amountIn0, c.token0, c.reserve0, c.reserve1);
      IERC20(c.token0).transfer(address(pool), amountIn0);
    }
    if (amountIn1 != 0) {
      uint bal = IERC20(c.token1).balanceOf(address(this));
      if (bal < amountIn1) {
        amountIn1 = bal;
      }
      amountOut0 = getAmountOut(c, amountIn1, c.token1, c.reserve0, c.reserve1);
      IERC20(c.token1).transfer(address(pool), amountIn1);
    }

    // we can not use flash coz vault shares protected
    pool.swap(
      amountOut0,
      amountOut1,
      address(this),
      bytes("")
    );

    (uint reserve0, uint reserve1,) = pool.getReserves();

    uint newPrice = getPoolPriceWithCustomReserves(c, reserve0, reserve1);

    require(!c.needBuyToken0 ?
      newPrice / PRICE_DIFF_TOLERANCE >= c.targetPrice / PRICE_DIFF_TOLERANCE
      : newPrice / PRICE_DIFF_TOLERANCE <= c.targetPrice / PRICE_DIFF_TOLERANCE,
      "PRICE");
  }

  //////////////////////////

  function getAmountOut(
    Context memory c,
    uint amountIn,
    address tokenIn,
    uint _reserve0,
    uint _reserve1
  ) public pure returns (uint) {
    uint decimals0 = c.decimals0;
    uint decimals1 = c.decimals1;
    address token0 = c.token0;
    uint fee = c.poolFee;
    bool stable = c.stable;
    amountIn -= (amountIn * fee) / 10000; // remove fee from amount received
    return _getAmountOut(amountIn, tokenIn, _reserve0, _reserve1, decimals0, decimals1, stable, token0);
  }


  function _getAmountOut(
    uint amountIn,
    address tokenIn,
    uint _reserve0,
    uint _reserve1,
    uint decimals0,
    uint decimals1,
    bool stable,
    address token0
  ) internal pure returns (uint) {
    if (stable) {
      uint xy = _k(_reserve0, _reserve1, decimals0, decimals1, stable);
      _reserve0 = (_reserve0 * 1e18) / decimals0;
      _reserve1 = (_reserve1 * 1e18) / decimals1;
      (uint reserveA, uint reserveB) = tokenIn == token0 ? (_reserve0, _reserve1) : (_reserve1, _reserve0);
      amountIn = tokenIn == token0 ? (amountIn * 1e18) / decimals0 : (amountIn * 1e18) / decimals1;
      uint y = reserveB - _get_y(amountIn + reserveA, xy, reserveB, decimals0, decimals1, stable);
      return (y * (tokenIn == token0 ? decimals1 : decimals0)) / 1e18;
    } else {
      (uint reserveA, uint reserveB) = tokenIn == token0 ? (_reserve0, _reserve1) : (_reserve1, _reserve0);
      return (amountIn * reserveB) / (reserveA + amountIn);
    }
  }

  function _k(uint x, uint y, uint decimals0, uint decimals1, bool stable) internal pure returns (uint) {
    if (stable) {
      uint _x = (x * 1e18) / decimals0;
      uint _y = (y * 1e18) / decimals1;
      uint _a = (_x * _y) / 1e18;
      uint _b = ((_x * _x) / 1e18 + (_y * _y) / 1e18);
      return (_a * _b) / 1e18; // x3y+y3x >= k
    } else {
      return x * y; // xy >= k
    }
  }

  function _f(uint x0, uint y) internal pure returns (uint) {
    uint _a = (x0 * y) / 1e18;
    uint _b = ((x0 * x0) / 1e18 + (y * y) / 1e18);
    return (_a * _b) / 1e18;
  }

  function _d(uint x0, uint y) internal pure returns (uint) {
    return (3 * x0 * ((y * y) / 1e18)) / 1e18 + ((((x0 * x0) / 1e18) * x0) / 1e18);
  }

  function _get_y(uint x0, uint xy, uint y, uint decimals0, uint decimals1, bool stable) internal pure returns (uint) {
    for (uint i = 0; i < 255; i++) {
      uint k = _f(x0, y);
      if (k < xy) {
        // there are two cases where dy == 0
        // case 1: The y is converged and we find the correct answer
        // case 2: _d(x0, y) is too large compare to (xy - k) and the rounding error
        //         screwed us.
        //         In this case, we need to increase y by 1
        uint dy = ((xy - k) * 1e18) / _d(x0, y);
        if (dy == 0) {
          if (k == xy) {
            // We found the correct answer. Return y
            return y;
          }
          if (_k(x0, y + 1, decimals0, decimals1, stable) > xy) {
            // If _k(x0, y + 1) > xy, then we are close to the correct answer.
            // There's no closer answer than y + 1
            return y + 1;
          }
          dy = 1;
        }
        y = y + dy;
      } else {
        uint dy = ((k - xy) * 1e18) / _d(x0, y);
        if (dy == 0) {
          if (k == xy || _f(x0, y - 1) < xy) {
            // Likewise, if k == xy, we found the correct answer.
            // If _f(x0, y - 1) < xy, then we are close to the correct answer.
            // There's no closer answer than "y"
            // It's worth mentioning that we need to find y where f(x0, y) >= xy
            // As a result, we can't return y - 1 even it's closer to the correct answer
            return y;
          }
          dy = 1;
        }
        y = y - dy;
      }
    }
    revert("!y");
  }
}
