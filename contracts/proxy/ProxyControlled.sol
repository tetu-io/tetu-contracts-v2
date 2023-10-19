// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IControllable.sol";
import "../interfaces/IProxyControlled.sol";
import "./UpgradeableProxy.sol";
import "../interfaces/IERC165.sol";
import "../lib/InterfaceIds.sol";

/// @title EIP1967 Upgradable proxy implementation.
/// @dev Only Controller has access and should implement time-lock for upgrade action.
/// @author belbix
contract ProxyControlled is UpgradeableProxy, IProxyControlled {

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant PROXY_CONTROLLED_VERSION = "1.0.1";

  /// @dev Initialize proxy implementation. Need to call after deploy new proxy.
  function initProxy(address _logic) external override {
    //make sure that given logic is controllable and not inited
    require(IERC165(_logic).supportsInterface(InterfaceIds.I_CONTROLLABLE), "Proxy: Wrong implementation");
    _init(_logic);
  }

  /// @notice Upgrade contract logic
  /// @dev Upgrade allowed only for Controller and should be done only after time-lock period
  /// @param _newImplementation Implementation address
  function upgrade(address _newImplementation) external override {
    require(IERC165(_newImplementation).supportsInterface(InterfaceIds.I_CONTROLLABLE), "Proxy: Wrong implementation");
    require(IControllable(address(this)).isController(msg.sender), "Proxy: Forbidden");
    IControllable(address(this)).increaseRevision(_implementation());
    _upgradeTo(_newImplementation);
    // the new contract must have the same ABI and you must have the power to change it again
    require(IControllable(address(this)).isController(msg.sender), "Proxy: Wrong implementation");
  }

  /// @notice Return current logic implementation
  function implementation() external override view returns (address) {
    return _implementation();
  }
}
