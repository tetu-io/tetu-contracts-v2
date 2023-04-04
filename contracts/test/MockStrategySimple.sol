// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../proxy/ControllableV3.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/IERC20.sol";

contract MockStrategySimple is ControllableV3, IStrategyV2 {

  string public constant override NAME = "mock strategy";
  string public constant override PLATFORM = "test";
  string public constant override STRATEGY_VERSION = "1.0.0";

  address public override splitter;
  address public override asset;
  bool public override isReadyToHardWork;
  uint public override compoundRatio;

  uint internal slippage;
  uint internal lastEarned;
  uint internal lastLost;

  uint internal _capacity;
  address public override performanceReceiver;
  uint public override performanceFee;

  function init(
    address controller_,
    address _splitter,
    address _asset
  ) external initializer {
    __Controllable_init(controller_);
    splitter = _splitter;
    asset = _asset;
    isReadyToHardWork = true;
    _capacity = type(uint).max; // unlimited capacity by default
    performanceReceiver = IController(controller_).governance();
    performanceFee = 10_000;
  }

  function totalAssets() public view override returns (uint) {
    return IERC20(asset).balanceOf(address(this));
  }

  function withdrawAllToSplitter() external override returns (uint strategyLoss) {
    return withdrawToSplitter(totalAssets());
  }

  function withdrawToSplitter(uint amount) public override returns (uint strategyLoss) {
    uint _slippage = amount * slippage / 100;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }
    IERC20(asset).transfer(splitter, amount - _slippage);
    return _slippage;
  }

  function investAll(
    uint amount_,
    bool updateTotalAssetsBeforeInvest_
  ) external pure override returns (
    uint strategyLoss
  ) {
    amount_; // hide warning
    updateTotalAssetsBeforeInvest_; // hide warning
    // noop
    return strategyLoss;
  }

  function doHardWork() external view override returns (uint earned, uint lost) {
    return (lastEarned, lastLost);
  }

  function setLast(uint earned, uint lost) external {
    lastEarned = earned;
    lastLost = lost;
  }

  function setSlippage(uint value) external {
    slippage = value;
  }

  function setCompoundRatio(uint value) external override {
    compoundRatio = value;
  }

  /// @notice Max amount that can be deposited to the strategy, see SCB-593
  function capacity() external view override returns (uint) {
    return _capacity;
  }

  function setCapacity(uint capacity_) external {
    _capacity = capacity_;
  }

  /// @notice Set performance fee and receiver
  function setupPerformanceFee(uint fee_, address receiver_) external {
    performanceFee = fee_;
    performanceReceiver = receiver_;
  }
}
