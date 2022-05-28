// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IGauge {

  function notifyRewardAmount(address stakingToken, address token, uint amount) external;

  function getReward(address account, address[] memory tokens) external;

  function claimFees() external returns (uint claimed0, uint claimed1);

}
