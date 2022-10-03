// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../proxy/ControllableV3.sol";

contract MockGauge is ControllableV3 {

  constructor (address controller_) {
    init(controller_);
  }

  function init(address controller_) internal initializer {
    __Controllable_init(controller_);
  }

  function handleBalanceChange(address) external {
    // noop
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_GAUGE || super.supportsInterface(interfaceId);
  }

}
