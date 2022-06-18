// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/EnumerableMap.sol";
import "../interfaces/IProxyControlled.sol";
import "../proxy/ControllableV3.sol";

/// @title A central contract of the TETU platform.
///        Holds all important contract addresses.
///        Able to upgrade proxies with time-lock.
/// @author belbix
contract ControllerV2 is ControllableV3, IController {
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableMap for EnumerableMap.UintToUintMap;
  using EnumerableMap for EnumerableMap.UintToAddressMap;
  using EnumerableMap for EnumerableMap.AddressToUintMap;

  enum AddressType {
    UNKNOWN,
    GOVERNANCE,
    TETU_VOTER,
    VAULT_CONTROLLER,
    LIQUIDATOR,
    FORWARDER,
    INVEST_FUND,
    VE_DIST,
    PLATFORM_VOTER
  }

  struct AddressAnnounce {
    uint _type;
    address newAddress;
    uint timeLockAt;
  }

  struct ProxyAnnounce {
    address proxy;
    address implementation;
    uint timeLockAt;
  }

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant CONTROLLER_VERSION = "2.0.0";
  uint public constant TIME_LOCK = 18 hours;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  // --- restrictions

  /// @dev Gnosis safe multi signature wallet with maximum power under the platform.
  address public override governance;
  /// @dev Operators can execute not-critical functions of the platform.
  EnumerableSet.AddressSet internal _operators;

  // --- dependency

  /// @dev Voter for distribute TETU to gauges.
  address public override voter;
  /// @dev Contract for set vaults attributes.
  address public override vaultController;
  /// @dev External solution for sell any tokens with minimal gas usage.
  address public override liquidator;
  /// @dev Accumulate performance fees and distribute them properly.
  address public override forwarder;
  /// @dev Contract for holding assets for the Second Stage
  address public override investFund;
  /// @dev Contract for accumulate TETU rewards for veTETU and weekly distribute them.
  address public override veDistributor;
  /// @dev Special voter for platform attributes.
  address public override platformVoter;

  // --- elements

  /// @dev Set of valid vaults
  EnumerableSet.AddressSet internal _vaults;

  // --- time locks

  EnumerableMap.UintToUintMap internal _addressTimeLocks;
  EnumerableMap.UintToAddressMap internal _addressAnnounces;

  EnumerableMap.AddressToUintMap internal _proxyTimeLocks;
  mapping(address => address) public proxyAnnounces;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event AddressChangeAnnounced(uint _type, address value);
  event AddressChanged(uint _type, address oldAddress, address newAddress);
  event ProxyUpgradeAnnounced(address proxy, address implementation);
  event ProxyUpgraded(address proxy, address implementation);
  event RegisterVault(address vault);
  event VaultRemoved(address vault);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(address _governance) external initializer {
    __Controllable_init(address(this));
    governance = _governance;
    _operators.add(_governance);
  }

  // *************************************************************
  //                     RESTRICTIONS
  // *************************************************************

  function _onlyGovernance() internal view {
    require(msg.sender == governance, "DENIED");
  }

  function _onlyOperators() internal view {
    require(_operators.contains(msg.sender), "DENIED");
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Return all announced address changes.
  function addressAnnouncesList() external view returns (AddressAnnounce[] memory announces) {
    uint length = _addressTimeLocks.length();
    announces = new AddressAnnounce[](length);
    for (uint i; i < length; ++i) {
      (uint _type, uint timeLock) = _addressTimeLocks.at(i);
      address newAddress = _addressAnnounces.get(_type);
      announces[i] = AddressAnnounce(_type, newAddress, timeLock);
    }
  }

  /// @dev Return all announced proxy upgrades.
  function proxyAnnouncesList() external view returns (ProxyAnnounce[] memory announces) {
    uint length = _proxyTimeLocks.length();
    announces = new ProxyAnnounce[](length);
    for (uint i; i < length; ++i) {
      (address proxy, uint timeLock) = _proxyTimeLocks.at(i);
      address implementation = proxyAnnounces[proxy];
      announces[i] = ProxyAnnounce(proxy, implementation, timeLock);
    }
  }

  /// @dev Return true if the value exist in the operator set.
  function isOperator(address value) external view override returns (bool) {
    return _operators.contains(value);
  }

  /// @dev Return all operators. Expect the array will have reasonable size.
  function operatorsList() external view returns (address[] memory) {
    return _operators.values();
  }

  /// @dev Return all vaults. Array can be too big for use this function.
  function vaultsList() external view override returns (address[] memory) {
    return _vaults.values();
  }

  /// @dev Vault set size.
  function vaultsListLength() external view override returns (uint) {
    return _vaults.length();
  }

  /// @dev Return vault with given id. Ordering can be changed with time!
  function vaults(uint id) external view override returns (address) {
    return _vaults.at(id);
  }

  /// @dev Return true if the vault valid.
  function isValidVault(address _vault) external view override returns (bool) {
    return _vaults.contains(_vault);
  }


  // *************************************************************
  //          SET ADDRESSES WITH TIME-LOCK PROTECTION
  // *************************************************************

  /// @dev Change time-locked address and remove lock info.
  function _addressChange(AddressType _type) internal {

  }

  /// @dev Add announce information for given address type.
  function announceNewAddress(AddressType _type, address value) external {
    _onlyGovernance();
    require(_addressAnnounces.set(uint(_type), value), "ANNOUNCED");
    _addressTimeLocks.set(uint(_type), block.timestamp + TIME_LOCK);

    emit AddressChangeAnnounced(uint(_type), value);
  }

  /// @dev Change announced address. Less strict for reduce governance actions.
  function changeAddress(AddressType _type) external {
    _onlyOperators();

    address newAddress = _addressAnnounces.get(uint(_type));
    uint timeLock = _addressTimeLocks.get(uint(_type));
    address oldAddress;

    require(newAddress != address(0), "ZERO_ADDRESS");
    require(timeLock != 0, "ZERO_TIME_LOCK");

    if (_type == AddressType.GOVERNANCE) {
      oldAddress = governance;
      governance = newAddress;
    } else if (_type == AddressType.TETU_VOTER) {
      oldAddress = voter;
      voter = newAddress;
    } else if (_type == AddressType.VAULT_CONTROLLER) {
      oldAddress = vaultController;
      vaultController = newAddress;
    } else if (_type == AddressType.LIQUIDATOR) {
      oldAddress = liquidator;
      liquidator = newAddress;
    } else if (_type == AddressType.FORWARDER) {
      oldAddress = forwarder;
      forwarder = newAddress;
    } else if (_type == AddressType.INVEST_FUND) {
      oldAddress = investFund;
      investFund = newAddress;
    } else if (_type == AddressType.VE_DIST) {
      oldAddress = veDistributor;
      veDistributor = newAddress;
    } else if (_type == AddressType.PLATFORM_VOTER) {
      oldAddress = platformVoter;
      platformVoter = newAddress;
    } else {
      revert("UNKNOWN");
    }

    // skip time-lock for initialization
    if (oldAddress != address(0)) {
      require(timeLock < block.timestamp, "LOCKED");
    }

    _addressAnnounces.remove(uint(_type));
    _addressTimeLocks.remove(uint(_type));

    emit AddressChanged(uint(_type), oldAddress, newAddress);
  }

  // *************************************************************
  //          UPGRADE PROXIES WITH TIME-LOCK PROTECTION
  // *************************************************************

  function announceProxyUpgrade(
    address[] memory proxies,
    address[] memory implementations
  ) external {
    _onlyGovernance();

    for (uint i; i < proxies.length; i++) {
      address proxy = proxies[i];
      address implementation = implementations[i];

      require(_proxyTimeLocks.set(proxy, block.timestamp + TIME_LOCK), "ANNOUNCED");
      proxyAnnounces[proxy] = implementation;

      emit ProxyUpgradeAnnounced(proxy, implementation);
    }
  }

  /// @dev Upgrade proxy. Less strict for reduce governance actions.
  function upgradeProxy(address[] memory proxies) external {
    _onlyOperators();

    for (uint i; i < proxies.length; i++) {
      address proxy = proxies[i];
      uint timeLock = _proxyTimeLocks.get(proxy);
      address implementation = proxyAnnounces[proxy];

      require(implementation != address(0), "IMPLEMENTATION");
      require(timeLock < block.timestamp, "LOCKED");

      IProxyControlled(proxy).upgrade(implementation);

      _proxyTimeLocks.remove(proxy);
      delete proxyAnnounces[proxy];

      emit ProxyUpgraded(proxy, implementation);
    }
  }

  // *************************************************************
  //                     REGISTER ACTIONS
  // *************************************************************

  /// @dev Register vault for eligibility for rewards.
  ///      Operator should do it as part of deployment process.
  function registerVault(address vault) external {
    _onlyOperators();

    require(_vaults.add(vault), "EXIST");
    emit RegisterVault(vault);
  }

  /// @dev Remove vault from the system. Only for critical cases.
  function removeVault(address vault) external {
    _onlyGovernance();

    require(_vaults.remove(vault), "NOT_EXIST");
    emit VaultRemoved(vault);
  }

  /// @dev Register new operator.
  function registerOperator(address value) external {
    _onlyGovernance();

    require(_operators.add(value), "EXIST");
  }

  /// @dev Remove operator.
  function removeOperator(address value) external {
    _onlyGovernance();

    require(_operators.remove(value), "NOT_EXIST");
  }

}
