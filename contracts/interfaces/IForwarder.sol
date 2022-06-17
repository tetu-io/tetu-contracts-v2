// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IForwarder {

  function distribute(address token) external;

  function setInvestFundRatio(uint value) external;

  function setGaugesRatio(uint value) external;

}
