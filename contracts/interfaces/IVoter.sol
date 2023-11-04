// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./IVeVotable.sol";

interface IVoter is IVeVotable {

  function ve() external view returns (address);

  function attachTokenToGauge(address stakingToken, uint _tokenId, address account) external;

  function detachTokenFromGauge(address stakingToken, uint _tokenId, address account) external;

  function distribute(address stakingToken) external;

  function distributeAll() external;

  function notifyRewardAmount(uint amount) external;

  function votedVaultsLength(uint veId) external view returns (uint);

}
