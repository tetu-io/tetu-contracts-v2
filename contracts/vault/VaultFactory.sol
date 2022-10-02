// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/ERC165.sol";
import "../interfaces/IController.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/ISplitter.sol";
import "../proxy/ProxyControlled.sol";
import "./VaultInsurance.sol";

/// @title Factory for vaults.
/// @author belbix
contract VaultFactory is ERC165 {

  // *************************************************************
  //                        VARIABLES
  // *************************************************************

  /// @dev Platform controller, need for restrictions.
  address public immutable controller;

  /// @dev TetuVaultV2 contract address
  address public vaultImpl;
  /// @dev VaultInsurance contract address
  address public vaultInsuranceImpl;
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
    address insurance,
    address splitterProxy,
    address splitterLogic
  );
  event VaultImplChanged(address value);
  event VaultInsuranceImplChanged(address value);
  event SplitterImplChanged(address value);

  constructor(
    address _controller,
    address _vaultImpl,
    address _vaultInsuranceImpl,
    address _splitterImpl
  ) {
    _requireInterface(_controller, type(IController).interfaceId);
    _requireInterface(_vaultImpl, type(ITetuVaultV2).interfaceId);
    _requireInterface(_vaultInsuranceImpl, type(IVaultInsurance).interfaceId);
    _requireInterface(_splitterImpl, type(ISplitter).interfaceId);

    controller = _controller;
    vaultImpl = _vaultImpl;
    vaultInsuranceImpl = _vaultInsuranceImpl;
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
    _requireInterface(value, type(ITetuVaultV2).interfaceId);
    vaultImpl = value;
    emit VaultImplChanged(value);
  }

  /// @dev Set VaultInsurance contract address
  function setVaultInsuranceImpl(address value) external onlyGov {
    _requireInterface(value, type(IVaultInsurance).interfaceId);
    vaultInsuranceImpl = value;
    emit VaultInsuranceImplChanged(value);
  }

  /// @dev Set StrategySplitterV2 contract address
  function setSplitterImpl(address value) external onlyGov {
    _requireInterface(value, type(ISplitter).interfaceId);
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
    // clone insurance
    VaultInsurance insurance = new VaultInsurance();
    // init insurance
    insurance.init(vaultProxy, address(asset));
    // set insurance to vault
    ITetuVaultV2(vaultProxy).initInsurance(insurance);

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
      address(insurance),
      splitterProxy,
      splitterLogic
    );
  }

}
