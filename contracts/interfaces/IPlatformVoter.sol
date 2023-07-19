// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./IVeVotable.sol";

interface IPlatformVoter is IVeVotable {

  enum AttributeType {
    UNKNOWN,
    INVEST_FUND_RATIO,
    GAUGE_RATIO,
    STRATEGY_COMPOUND
  }

  struct Vote {
    AttributeType _type;
    address target;
    uint weight;
    uint weightedValue;
    uint timestamp;
  }

  function veVotesLength(uint veId) external view returns (uint);

}
