// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./IStrategyV2.sol";

interface IStrategyV3 is IStrategyV2 {
  struct BaseState {
    /// @dev Underlying asset
    address asset;

    /// @dev Linked splitter
    address splitter;

    /// @notice {performanceFee}% of total profit is sent to {performanceReceiver} before compounding
    /// @dev governance by default
    address performanceReceiver;

    /// @notice A percent of total profit that is sent to the {performanceReceiver} before compounding
    /// @dev {DEFAULT_PERFORMANCE_FEE} by default, FEE_DENOMINATOR is used
    uint performanceFee;

    /// @dev Percent of profit for autocompound inside this strategy.
    uint compoundRatio;

    /// @dev Represent specific name for this strategy. Should include short strategy name and used assets. Uniq across the vault.
    string strategySpecificName;
  }
}
