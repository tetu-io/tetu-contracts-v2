// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IVeDistributor {

  function notifyReward(uint amount) external;

  function claim(uint _tokenId) external returns (uint);

}
