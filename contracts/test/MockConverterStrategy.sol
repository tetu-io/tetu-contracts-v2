// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../strategy/ConverterStrategyBase.sol";
import "./MockDepositor.sol";

/// @title Mock Converter Strategy with MockDepositor
/// @author bogdoslav
contract MockConverterStrategy is ConverterStrategyBase, MockDepositor {

  string public constant override NAME = "mock converter strategy";
  string public constant override PLATFORM = "test";
  string public constant override STRATEGY_VERSION = "1.0.0";

  function init(
    address controller_,
    address splitter_,
    address converter_,
    address[] memory depositorTokens_,
    uint8[] memory depositorWeights_,
    address[] memory depositorRewardTokens_,
    uint[] memory depositorRewardAmounts_
  ) external initializer {
    __MockDepositor_init(depositorTokens_, depositorWeights_, depositorRewardTokens_, depositorRewardAmounts_);
    __ConverterStrategyBase_init(controller_, splitter_, converter_);
  }

}
