// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IStrategyV2 {

  function asset() external view returns (address);

  function totalAssets() external view returns (uint);

  function withdrawAllToSplitter() external;

  function withdrawToSplitter(uint amount) external;

  function investAll() external;

  function doHardWork() external;

}
