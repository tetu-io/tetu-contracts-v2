// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../tools/TetuERC165.sol";
import "../interfaces/IController.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/ISplitter.sol";
import "../proxy/ProxyControlled.sol";
import "../lib/InterfaceIds.sol";

/// @title Factory for vaults.
/// @author belbix
/// @author a17
contract VaultFactory is TetuERC165 {

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant FACTORY_VERSION = "2.0.0";

  // *************************************************************
  //                        VARIABLES
  // *************************************************************

  /// @dev Platform controller, need for restrictions.
  address public immutable controller;

  /// @dev TetuVaultV2 contract address
  address public vaultImpl;

  /// @dev StrategySplitterV2 contract address
  address public splitterImpl;

  /// @dev Array of deployed vaults.
  address[] public deployedVaults;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event VaultDeployed(
    address sender,
    address asset,
    string name,
    string symbol,
    address gauge,
    uint buffer,
    address vaultProxy,
    address vaultLogic,
    address splitterProxy,
    address splitterLogic
  );
  event VaultImplChanged(address value);
  event SplitterImplChanged(address value);

  constructor(
    address _controller,
    address _vaultImpl,
    address _splitterImpl
  ) {
    _requireInterface(_controller, InterfaceIds.I_CONTROLLER);
    _requireInterface(_vaultImpl, InterfaceIds.I_TETU_VAULT_V2);
    _requireInterface(_splitterImpl, InterfaceIds.I_SPLITTER);

    controller = _controller;
    vaultImpl = _vaultImpl;
    splitterImpl = _splitterImpl;
  }

  function deployedVaultsLength() external view returns (uint) {
    return deployedVaults.length;
  }

  // *************************************************************
  //                        RESTRICTIONS
  // *************************************************************

  /// @dev Only governance
  modifier onlyGov() {
    require(msg.sender == IController(controller).governance(), "!GOV");
    _;
  }

  /// @dev Only platform operators
  modifier onlyOperator() {
    require(IController(controller).isOperator(msg.sender), "!OPERATOR");
    _;
  }

  // *************************************************************
  //                        GOV ACTIONS
  // *************************************************************

  /// @dev Set TetuVaultV2 contract address
  function setVaultImpl(address value) external onlyGov {
    _requireInterface(value, InterfaceIds.I_TETU_VAULT_V2);
    vaultImpl = value;
    emit VaultImplChanged(value);
  }

  /// @dev Set StrategySplitterV2 contract address
  function setSplitterImpl(address value) external onlyGov {
    _requireInterface(value, InterfaceIds.I_SPLITTER);
    splitterImpl = value;
    emit SplitterImplChanged(value);
  }

  // *************************************************************
  //                    OPERATOR ACTIONS
  // *************************************************************

  /// @dev Create and init vault with given attributes.
  function createVault(
    IERC20 asset,
    string memory name,
    string memory symbol,
    address gauge,
    uint buffer
  ) external onlyOperator {
    // clone vault implementations
    address vaultProxy = address(new ProxyControlled());
    address vaultLogic = vaultImpl;
    // init proxy
    IProxyControlled(vaultProxy).initProxy(vaultLogic);
    // init vault
    ITetuVaultV2(vaultProxy).init(
      controller,
      asset,
      name,
      symbol,
      gauge,
      buffer
    );

    // clone splitter
    address splitterProxy = address(new ProxyControlled());
    address splitterLogic = splitterImpl;
    // init proxy
    IProxyControlled(splitterProxy).initProxy(splitterLogic);
    // init splitter
    ISplitter(splitterProxy).init(controller, address(asset), vaultProxy);
    // set splitter to vault
    ITetuVaultV2(vaultProxy).setSplitter(splitterProxy);

    deployedVaults.push(vaultProxy);

    emit VaultDeployed(
      msg.sender,
      address(asset),
      name,
      symbol,
      gauge,
      buffer,
      vaultProxy,
      vaultLogic,
      splitterProxy,
      splitterLogic
    );
  }

}
