// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../strategy/StrategyBaseV2.sol";
import "./MockPool.sol";

contract MockStrategy is StrategyBaseV2 {

  string public constant override NAME = "mock strategy";
  string public constant override PLATFORM = "test";
  string public constant override STRATEGY_VERSION = "1.0.0";

  bool public override isReadyToHardWork;

  uint slippage;
  uint lastEarned;
  uint lastLost;

  MockPool public pool;

  function init(
    address controller_,
    address _splitter
  ) external initializer {
    __StrategyBase_init(controller_, _splitter);
    splitter = _splitter;
    isReadyToHardWork = true;
    pool = new MockPool();
  }

  function doHardWork() external view override returns (uint earned, uint lost) {
    return (lastEarned, lastLost);
  }

  /// @dev Amount of underlying assets invested to the pool.
  function investedAssets() public view override returns (uint) {
    return IERC20(asset).balanceOf(address(pool));
  }

  /// @dev Deposit given amount to the pool.
  function _depositToPool(uint amount) internal override {
    IERC20(asset).transfer(address(pool), amount);
  }

  /// @dev Withdraw given amount from the pool.
  function _withdrawFromPool(uint amount) internal override {
    pool.withdraw(asset, amount);
    uint _slippage = amount * slippage / 100;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }
  }

  /// @dev Withdraw all from the pool.
  function _withdrawAllFromPool() internal override {
    pool.withdraw(asset, investedAssets());
    uint _slippage = totalAssets() * slippage / 100;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }
  }

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  function _emergencyExitFromPool() internal override {
    pool.withdraw(asset, investedAssets());
  }

  /// @dev Claim all possible rewards.
  function _claim() internal override {
    // noop
  }

  function setLast(uint earned, uint lost) external {
    lastEarned = earned;
    lastLost = lost;
  }

  function setSlippage(uint value) external {
    slippage = value;
  }

  function setReady(bool value) external {
    isReadyToHardWork = value;
  }

}
