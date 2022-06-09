// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/ISplitter.sol";
import "../interfaces/IERC20.sol";
import "../proxy/ControllableV3.sol";

contract MockSplitter is ISplitter, ControllableV3 {

  address public override asset;
  address public override vault;

  constructor (address controller_, address _asset, address _vault) {
    asset = _asset;
    vault = _vault;
    init(controller_);
  }

  function init(address controller_) internal initializer {
    __Controllable_init(controller_);
  }

  function withdrawAllToVault() external override {
    IERC20(asset).transfer(vault, IERC20(asset).balanceOf(address(this)));
  }

  function withdrawToVault(uint256 amount) external override {
    IERC20(asset).transfer(vault, amount);
  }

  function doHardWork() external override {
    // noop
  }

  function investAllAssets() external override {
    // noop
  }

  function totalAssets() external view override returns (uint256) {
    return IERC20(asset).balanceOf(address(this));
  }

  function isHardWorking() external pure override returns (bool) {
    return false;
  }

}
