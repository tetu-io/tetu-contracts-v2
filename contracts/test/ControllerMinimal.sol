// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IProxyControlled.sol";

contract ControllerMinimal {

  address public governance;
  address public voter;
  address public vePawnshop;

  constructor (address governance_) {
    governance = governance_;
  }

  function setVoter(address _voter) external {
    voter = _voter;
  }

  function setVePawnshop(address _vePawnshop) external {
    vePawnshop = _vePawnshop;
  }

  function updateProxies(address[] memory proxies, address[] memory newLogics) external {
    require(proxies.length == newLogics.length, "Wrong arrays");
    for (uint i; i < proxies.length; i++) {
      IProxyControlled(proxies[i]).upgrade(newLogics[i]);
    }
  }

}
