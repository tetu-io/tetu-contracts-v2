// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IVeTetu.sol";
import "../interfaces/IERC20.sol";

contract MockVoter {

  IVeTetu public ve;

  constructor(address _ve) {
    ve = IVeTetu(_ve);
  }

  function attachTokenToGauge(address, uint tokenId, address) external {
    if (tokenId > 0) {
      ve.attachToken(tokenId);
    }
  }

  function detachTokenFromGauge(address, uint tokenId, address) external {
    if (tokenId > 0) {
      ve.detachToken(tokenId);
    }
  }

  function distribute(address, address) external {
    // noop
  }

  function voting(uint id) external {
    IVeTetu(ve).voting(id);
  }

  function abstain(uint id) external {
    IVeTetu(ve).abstain(id);
  }

  function detachTokenFromAll(uint tokenId, address) external {
    while (ve.attachments(tokenId) > 0) {
      ve.detachToken(tokenId);
    }
    if (ve.voted(tokenId)) {
      IVeTetu(ve).abstain(tokenId);
    }
  }

  function notifyRewardAmount(uint amount) external {
    IERC20(ve.tokens(0)).transferFrom(msg.sender, address(this), amount);
  }

}
