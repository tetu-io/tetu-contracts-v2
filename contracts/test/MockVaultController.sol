// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/ITetuVaultV2.sol";

contract MockVaultController {

  function setSplitter(address vault, address splitter) external {
    ITetuVaultV2(vault).setSplitter(splitter);
  }

}
