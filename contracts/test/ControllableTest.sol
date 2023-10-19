// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../proxy/ControllableV3.sol";

contract ControllableTest is ControllableV3 {

  uint private _variable;

  function init(address controller_) external initializer {
    ControllableV3.__Controllable_init(controller_);
    _variable = 333;
  }

  function increase() external {
    this.increaseRevision(address(this));
  }
}
