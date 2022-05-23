// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC4626 {

  event Deposit(address indexed caller, address indexed owner, uint assets, uint shares);

  event Withdraw(
    address indexed caller,
    address indexed receiver,
    address indexed owner,
    uint assets,
    uint shares
  );


  function deposit(uint assets, address receiver) external returns (uint shares);

  function mint(uint shares, address receiver) external returns (uint assets);

  function withdraw(
    uint assets,
    address receiver,
    address owner
  ) external returns (uint shares);

  function redeem(
    uint shares,
    address receiver,
    address owner
  ) external returns (uint assets);

  function totalAssets() external view returns (uint);

  function convertToShares(uint assets) external view returns (uint);

  function convertToAssets(uint shares) external view returns (uint);

  function previewDeposit(uint assets) external view returns (uint);

  function previewMint(uint shares) external view returns (uint);

  function previewWithdraw(uint assets) external view returns (uint);

  function previewRedeem(uint shares) external view returns (uint);

  function maxDeposit(address) external view returns (uint);

  function maxMint(address) external view returns (uint);

  function maxWithdraw(address owner) external view returns (uint);

  function maxRedeem(address owner) external view returns (uint);

}
