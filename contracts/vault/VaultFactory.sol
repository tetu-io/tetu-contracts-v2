// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IController.sol";
import "../interfaces/IProxyControlled.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IVaultInsurance.sol";
import "../interfaces/ISplitter.sol";
import "../openzeppelin/Clones.sol";

contract VaultFactory {

  // *************************************************************
  //                        VARIABLES
  // *************************************************************

  address public immutable controller;

  address public proxyImpl;
  address public vaultImpl;
  address public vaultInsuranceImpl;
  address public splitterImpl;

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

  constructor(
    address _controller,
    address _proxyImpl,
    address _vaultImpl,
    address _vaultInsuranceImpl,
    address _splitterImpl
  ) {
    controller = _controller;
    proxyImpl = _proxyImpl;
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

  modifier onlyGov() {
    require(msg.sender == IController(controller).governance(), "!GOV");
    _;
  }

  modifier onlyOperator() {
    require(IController(controller).isOperator(msg.sender), "!OPERATOR");
    _;
  }

  // *************************************************************
  //                        GOV ACTIONS
  // *************************************************************

  function setProxyImpl(address value) external onlyGov {
    proxyImpl = value;
  }

  function setVaultImpl(address value) external onlyGov {
    vaultImpl = value;
  }

  function setVaultInsuranceImpl(address value) external onlyGov {
    vaultInsuranceImpl = value;
  }

  function setSplitterImpl(address value) external onlyGov {
    splitterImpl = value;
  }

  // *************************************************************
  //                        OPERATOR ACTIONS
  // *************************************************************

  function createVault(
    IERC20 asset,
    string memory name,
    string memory symbol,
    address gauge,
    uint buffer
  ) external onlyOperator {
    // clone vault implementations
    address vaultProxy = Clones.clone(proxyImpl);
    address vaultLogic = Clones.clone(vaultImpl);
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
    IVaultInsurance insurance = IVaultInsurance(Clones.clone(vaultInsuranceImpl));
    // init insurance
    insurance.init(vaultProxy, address(asset));
    // set insurance to vault
    ITetuVaultV2(vaultProxy).initInsurance(insurance);

    // clone splitter
    address splitterProxy = Clones.clone(proxyImpl);
    address splitterLogic = Clones.clone(splitterImpl);
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
