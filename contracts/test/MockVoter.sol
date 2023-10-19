// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IVeTetu.sol";
import "../interfaces/IVoter.sol";
import "../interfaces/IERC20.sol";

contract MockVoter is IVoter {

  address public override ve;
  mapping(uint => uint) public mockVotes;

  constructor(address _ve) {
    ve = _ve;
  }

  function votedVaultsLength(uint veId) external view override returns (uint) {
    return mockVotes[veId];
  }

  function attachTokenToGauge(address, uint tokenId, address) external override {
    if (tokenId > 0) {
      IVeTetu(ve).attachToken(tokenId);
    }
  }

  function detachTokenFromGauge(address, uint tokenId, address) external override {
    if (tokenId > 0) {
      IVeTetu(ve).detachToken(tokenId);
    }
  }

  function distribute(address) external override {
    // noop
  }

  function voting(uint id) external {
    mockVotes[id]++;
  }

  function abstain(uint id) external {
    mockVotes[id]--;
  }

  function detachTokenFromAll(uint tokenId, address) external override {
    while (IVeTetu(ve).attachments(tokenId) > 0) {
      IVeTetu(ve).detachToken(tokenId);
    }
    mockVotes[tokenId] = 0;
  }

  function notifyRewardAmount(uint amount) external override {
    IERC20(IVeTetu(ve).tokens(0)).transferFrom(msg.sender, address(this), amount);
  }

  function isVotesExist(uint veId) external view override returns (bool) {
    return mockVotes[veId] > 0;
  }

}
