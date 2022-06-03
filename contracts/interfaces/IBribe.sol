// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IBribe {

  function notifyRewardAmount(address token, uint amount) external;

  function _deposit(address vault, uint amount, uint tokenId) external;

  function _withdraw(address vault, uint amount, uint tokenId) external;

  function getRewardForOwner(uint tokenId, address[] memory tokens) external;

}
