// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./openzeppelin/ERC20Permit.sol";

contract TetuTokenMainnet is ERC20Permit {

  constructor() ERC20("Tetu Token", "TETU") ERC20Permit("Tetu Token") {
    // premint max possible supply for using them in a bridging process
    _mint(msg.sender, 1_000_000_000e18);
  }

}
