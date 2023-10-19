// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../lib/Base64.sol";

contract Base64Test {

  function encode(bytes memory data) external pure returns (string memory) {
    return Base64.encode(data);
  }

}
