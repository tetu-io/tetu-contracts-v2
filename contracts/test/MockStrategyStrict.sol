// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IERC20.sol";
import "../strategy/StrategyStrictBase.sol";
import "./MockPool.sol";

contract MockStrategyStrict is StrategyStrictBase {

  string public constant override NAME = "mock strategy strict";
  string public constant override PLATFORM = "test";
  string public constant override STRATEGY_VERSION = "1.0.0";

  bool public override isReadyToHardWork;

  uint internal slippage;
  uint internal slippageDeposit;
  uint internal lastEarned;
  uint internal lastLost;

  MockPool public pool;

  constructor() {
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
    uint _slippage = amount * slippageDeposit / 100_000;
    if (_slippage != 0) {
      IERC20(asset).transfer(vault, _slippage);
    }
    if (amount - _slippage != 0) {
      IERC20(asset).transfer(address(pool), amount - _slippage);
    }
  }

    /// @dev Withdraw given amount from the pool.
  function _withdrawFromPool(uint amount) internal override returns (uint investedAssetsUSD, uint assetPrice) {
    assetPrice = 1e18;
    investedAssetsUSD = amount;
    pool.withdraw(asset, amount);
    uint _slippage = amount * slippage / 100_000;
    if (_slippage != 0) {
      IERC20(asset).transfer(vault, _slippage);
    }
  }

  /// @dev Withdraw all from the pool.
  function _withdrawAllFromPool() internal override returns (uint investedAssetsUSD, uint assetPrice) {
    assetPrice = 1e18;
    investedAssetsUSD = investedAssets();
    pool.withdraw(asset, investedAssets());
    uint _slippage = totalAssets() * slippage / 100_000;
    if (_slippage != 0) {
      IERC20(asset).transfer(vault, _slippage);
    }
    return (0, 0);
  }

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  function _emergencyExitFromPool() internal override {
    pool.withdraw(asset, investedAssets());
  }

  /// @dev Claim all possible rewards.
  function _claim() internal override {
    // noop
  }

  function setSlippage(uint value) external {
    slippage = value;
  }

  function setSlippageDeposit(uint value) external {
    slippageDeposit = value;
  }

}
