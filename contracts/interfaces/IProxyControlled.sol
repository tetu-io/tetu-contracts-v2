// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IProxyControlled {

  function initProxy(address _logic) external;

  function upgrade(address _newImplementation) external;

  function implementation() external view returns (address);

}
