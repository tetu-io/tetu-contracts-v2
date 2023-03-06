// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IStrategyV2 {

  function NAME() external view returns (string memory);

  function PLATFORM() external view returns (string memory);

  function STRATEGY_VERSION() external view returns (string memory);

  function asset() external view returns (address);

  function splitter() external view returns (address);

  function compoundRatio() external view returns (uint);

  function totalAssets() external view returns (uint);

  /// @dev Usually, indicate that claimable rewards have reasonable amount.
  function isReadyToHardWork() external view returns (bool);

  function withdrawAllToSplitter() external;

  function withdrawToSplitter(uint amount) external;

  /// @notice Stakes everything the strategy holds into the reward pool.
  /// @param amount_ Amount transferred to the strategy balance just before calling this function
  /// todo return totalAssetsBeforeInvestOut
  function investAll(uint amount_) external; // todo returns (uint totalAssetsBeforeInvestOut);

  function doHardWork() external returns (uint earned, uint lost);

  function setCompoundRatio(uint value) external;

  /// @notice Max amount that can be deposited to the strategy (its internal capacity), see SCB-593.
  ///         0 means no deposit is allowed at this moment
  function capacity() external view returns (uint);
}
