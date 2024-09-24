// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./IVeDistributor.sol";

interface IVeDistributorV2 is IVeDistributor {

  function epoch() external view returns (uint);

  function lastPaidEpoch(uint veId) external view returns (uint);

}
