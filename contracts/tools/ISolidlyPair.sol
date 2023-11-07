// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

interface ISolidlyPair {

  function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

  function getReserves() external view returns (uint _reserve0, uint _reserve1, uint32 _blockTimestampLast);

  function getAmountOut(uint, address) external view returns (uint);

  function tokens() external view returns (address, address);

  function factory() external view returns (address);

  function stable() external view returns (bool);
}
