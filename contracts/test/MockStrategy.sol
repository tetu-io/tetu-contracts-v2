// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../proxy/ControllableV3.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/IERC20.sol";

contract MockStrategy is ControllableV3, IStrategyV2 {

  address public override splitter;
  address public override asset;

  uint lastEarned;
  uint lastLost;

  function init(
    address controller_,
    address _splitter,
    address _asset
  ) external initializer {
    __Controllable_init(controller_);
    splitter = _splitter;
    asset = _asset;
  }

  function totalAssets() public view override returns (uint) {
    return IERC20(asset).balanceOf(address(this));
  }

  function withdrawAll() external override{
    withdraw(totalAssets());
  }

  function withdraw(uint amount) public override {
    IERC20(asset).transfer(splitter, amount);
  }

  function investAll() external override {
    // noop
  }

  function doHardWork() external view override returns (uint earned, uint lost) {
    return (lastEarned, lastLost);
  }

  function setLast(uint earned, uint lost) external {
    lastEarned = earned;
    lastLost = lost;
  }


}
