// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IVeVotable {

  function isVotesExist(uint veId) external view returns (bool);

  function detachTokenFromAll(uint tokenId, address owner) external;

}
