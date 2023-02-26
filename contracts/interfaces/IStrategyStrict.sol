// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IStrategyStrict {

  function NAME() external view returns (string memory);

  function PLATFORM() external view returns (string memory);

  function STRATEGY_VERSION() external view returns (string memory);

  function asset() external view returns (address);

  function vault() external view returns (address);

  function compoundRatio() external view returns (uint);

  function totalAssets() external view returns (uint);

  /// @dev Usually, indicate that claimable rewards have reasonable amount.
  function isReadyToHardWork() external view returns (bool);

  function withdrawAllToVault() external;

  function withdrawToVault(uint amount) external;

  function investAll() external;

  function doHardWork() external returns (uint earned, uint lost);

}
