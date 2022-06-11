// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IVaultInsurance {

  function init(address _vault, address _asset) external;

  function vault() external view returns (address);

  function asset() external view returns (address);

  function transferToVault(uint amount) external;

}
