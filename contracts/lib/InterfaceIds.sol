// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IVoter.sol";
import "../interfaces/IBribe.sol";
import "../interfaces/IGauge.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IMultiPool.sol";
import "../interfaces/IForwarder.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/IController.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IControllable.sol";
import "../interfaces/IPlatformVoter.sol";
import "../interfaces/IVeDistributor.sol";
import "../interfaces/IVaultInsurance.sol";

/// @title Library for interface IDs
/// @author bogdoslav
library InterfaceIds {

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant INTERFACES_LIB_VERSION = "1.0.0";

  /// As type({Interface}).interfaceId can be changed
  /// when some functions changed at the interface,
  /// so used hardcoded interface identifiers

  bytes4 public constant I_VOTER = bytes4(keccak256('IVoter'));
  bytes4 public constant I_BRIBE = bytes4(keccak256('IBribe'));
  bytes4 public constant I_GAUGE = bytes4(keccak256('IGauge'));
  bytes4 public constant I_VE_TETU = bytes4(keccak256('IVeTetu'));
  bytes4 public constant I_SPLITTER = bytes4(keccak256('ISplitter'));
  bytes4 public constant I_FORWARDER = bytes4(keccak256('IForwarder'));
  bytes4 public constant I_MULTI_POOL = bytes4(keccak256('IMultiPool'));
  bytes4 public constant I_CONTROLLER = bytes4(keccak256('IController'));
  bytes4 public constant I_STRATEGY_V2 = bytes4(keccak256('IStrategyV2'));
  bytes4 public constant I_CONTROLLABLE = bytes4(keccak256('IControllable'));
  bytes4 public constant I_TETU_VAULT_V2 = bytes4(keccak256('ITetuVaultV2'));
  bytes4 public constant I_PLATFORM_VOTER = bytes4(keccak256('IPlatformVoter'));
  bytes4 public constant I_VE_DISTRIBUTOR = bytes4(keccak256('IVeDistributor'));
  bytes4 public constant I_VAULT_INSURANCE = bytes4(keccak256('IVaultInsurance'));

}
