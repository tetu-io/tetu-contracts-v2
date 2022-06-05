// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../lib/CheckpointLib.sol";

contract CheckpointLibTest {

  mapping(uint => CheckpointLib.Checkpoint) checkpoints;

  function addCheckpoint(uint id, CheckpointLib.Checkpoint memory cp) external {
    checkpoints[id] = cp;
  }

  function findLowerIndex(uint size, uint timestamp) external view returns (uint) {
    return CheckpointLib.findLowerIndex(checkpoints, size, timestamp);
  }

}
