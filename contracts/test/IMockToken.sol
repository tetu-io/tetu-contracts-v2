// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

interface IMockToken {

  function decimals() external view returns (uint8);

  function mint(address to, uint amount) external;

  function burn(address from, uint amount) external;
}
