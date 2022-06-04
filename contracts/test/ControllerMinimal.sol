// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IProxyControlled.sol";
import "../interfaces/IController.sol";

contract ControllerMinimal is IController {

  address public override governance;
  address public override voter;
  address public override vePawnshop;
  address[] public vaults;
  mapping(address => bool) public operators;

  constructor (address governance_) {
    governance = governance_;
  }

  function setVoter(address _voter) external {
    voter = _voter;
  }

  function setVePawnshop(address _vePawnshop) external {
    vePawnshop = _vePawnshop;
  }

  function addVault(address vault) external {
    vaults.push(vault);
  }

  function updateProxies(address[] memory proxies, address[] memory newLogics) external {
    require(proxies.length == newLogics.length, "Wrong arrays");
    for (uint i; i < proxies.length; i++) {
      IProxyControlled(proxies[i]).upgrade(newLogics[i]);
    }
  }

  function vaultsList() external view override returns (address[] memory) {
    return vaults;
  }

  function vaultsListLength() external override view returns (uint) {
    return vaults.length;
  }

  function isValidVault(address _vault) external view override returns (bool) {
    for (uint i; i < vaults.length; i++) {
      if (_vault == vaults[i]) {
        return true;
      }
    }
    return false;
  }

  function isOperator(address _adr) external view override returns (bool) {
    return operators[_adr];
  }

}
