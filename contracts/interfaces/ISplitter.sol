// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface ISplitter {

  function init(address controller_, address _asset, address _vault) external;

  // *************** ACTIONS **************

  function withdrawAllToVault() external;

  function withdrawToVault(uint256 amount) external;

  function coverPossibleStrategyLoss(uint earned, uint lost) external;

  function doHardWork() external;

  function investAll() external;

  // **************** VIEWS ***************

  function asset() external view returns (address);

  function vault() external view returns (address);

  function totalAssets() external view returns (uint256);

  function isHardWorking() external view returns (bool);

  function strategies(uint i) external view returns (address);

  function strategiesLength() external view returns (uint);

  function HARDWORK_DELAY() external view returns (uint);

  function lastHardWorks(address strategy) external view returns (uint);

  function pausedStrategies(address strategy) external view returns (bool);

  function pauseInvesting(address strategy) external;

  function continueInvesting(address strategy, uint apr) external;

  function rebalance(uint percent, uint lossTolerance) external;

  function getStrategyCapacity(address strategy) external view returns (uint capacity);

}
