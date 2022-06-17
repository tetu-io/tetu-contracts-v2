// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IPlatformVoter {

  function detachTokenFromAll(uint tokenId, address owner) external;

}
