// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../lib/StringLib.sol";

contract StringLibFacade {

  function uintToString(uint value) external pure returns (string memory) {
    return StringLib.toString(value);
  }

  function toAsciiString(address x) external pure returns (string memory) {
    return StringLib.toAsciiString(x);
  }

  function char(bytes1 b) external pure returns (bytes1 c) {
    return StringLib.char(b);
  }

}
