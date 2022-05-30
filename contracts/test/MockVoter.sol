// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IVeTetu.sol";

contract MockVoter {

  IVeTetu public ve;

  constructor(address _ve) {
    ve = IVeTetu(_ve);
  }

  function attachTokenToGauge(uint tokenId, address) external {
    if (tokenId > 0) {
      ve.attachToken(tokenId);
    }
  }

  function detachTokenFromGauge(uint tokenId, address) external {
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

}
