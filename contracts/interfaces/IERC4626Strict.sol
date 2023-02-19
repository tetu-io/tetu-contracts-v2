// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./IERC20.sol";

interface IERC4626Strict {
  function asset() external view returns (address);
}
