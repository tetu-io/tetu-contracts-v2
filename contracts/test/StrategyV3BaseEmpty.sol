// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../strategy/StrategyBaseV3.sol";

contract StrategyV3BaseEmpty is StrategyBaseV3 {
  string public constant override NAME = "empty strategy";
  string public constant override PLATFORM = "test";
  string public constant override STRATEGY_VERSION = "1.0.0";

  function init() external {
    __StrategyBase_init(address(0), address(0));
  }

  function _claim() internal pure override returns (address[] memory rewardTokens, uint[] memory amounts) {}

  function _depositToPool(uint amount, bool /*updateTotalAssetsBeforeInvest_*/) internal override returns (uint strategyLoss) {}

  function _emergencyExitFromPool() internal virtual override {}

  function _withdrawAllFromPool() internal override returns (uint expectedWithdrewUSD, uint assetPrice, uint strategyLoss) {}

  function _withdrawFromPool(uint amount) internal override returns (uint expectedWithdrewUSD, uint assetPrice, uint strategyLoss) {}

  function capacity() external view returns (uint) {}

  function doHardWork() external returns (uint earned, uint lost) {}

  function isReadyToHardWork() external view returns (bool) {}

  function investedAssets() public view virtual override returns (uint) {}
}