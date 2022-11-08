// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IMockToken {

  function decimals() external view returns (uint8);

  function mint(address to, uint amount) external;

  function burn(address from, uint amount) external;
}
