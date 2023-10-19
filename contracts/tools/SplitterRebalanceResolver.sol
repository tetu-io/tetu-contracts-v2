// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IStrategyV2.sol";
import "../proxy/ControllableV3.sol";
import "./../lib/StringLib.sol";

/// @title Gelato resolver for rebalance strategies
/// @author belbix
contract SplitterRebalanceResolver is ControllableV3 {
  // --- CONSTANTS ---

  string public constant VERSION = "1.0.0";
  uint public constant DELAY_RATE_DENOMINATOR = 100_000;
  uint public constant DEFAULT_PERCENT = 10;
  uint public constant DEFAULT_TOLERANCE = 100;

  // --- VARIABLES ---

  address public owner;
  address public pendingOwner;
  uint public delay;
  uint public maxGas;

  mapping(address => uint) public delayRate;
  mapping(address => bool) public operators;
  mapping(address => bool) public excludedVaults;
  uint public lastCall;
  mapping(address => uint) public lastCallPerVault;
  mapping(address => uint) public percentPerVault;
  mapping(address => uint) public tolerancePerVault;

  // --- INIT ---

  function init(address controller_) external initializer {
    ControllableV3.__Controllable_init(controller_);

    owner = msg.sender;
    delay = 1 days;
    maxGas = 35 gwei;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "!owner");
    _;
  }

  // --- OWNER FUNCTIONS ---

  function offerOwnership(address value) external onlyOwner {
    pendingOwner = value;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingOwner, "!pendingOwner");
    owner = pendingOwner;
    pendingOwner = address(0);
  }

  function setDelay(uint value) external onlyOwner {
    delay = value;
  }

  function setMaxGas(uint value) external onlyOwner {
    maxGas = value;
  }

  function setDelayRate(address[] memory _vaults, uint value) external onlyOwner {
    for (uint i; i < _vaults.length; ++i) {
      delayRate[_vaults[i]] = value;
    }
  }

  function setPercentPerVault(address vault, uint percent) external onlyOwner {
    percentPerVault[vault] = percent;
  }

  function setTolerancePerVault(address vault, uint value) external onlyOwner {
    tolerancePerVault[vault] = value;
  }

  function changeOperatorStatus(address operator, bool status) external onlyOwner {
    operators[operator] = status;
  }

  function changeVaultExcludeStatus(address[] memory _vaults, bool status) external onlyOwner {
    for (uint i; i < _vaults.length; ++i) {
      excludedVaults[_vaults[i]] = status;
    }
  }

  // --- MAIN LOGIC ---

  function call(address vault) external {
    require(operators[msg.sender], "!operator");
    require(isReadyForCall(vault, delay), "!ready");

    ISplitter splitter = ITetuVaultV2(vault).splitter();

    uint percent = percentPerVault[vault];
    if (percent == 0) {
      percent = DEFAULT_PERCENT;
    }

    uint tolerance = tolerancePerVault[vault];
    if (tolerance == 0) {
      tolerance = DEFAULT_TOLERANCE;
    }

    splitter.rebalance(percent, tolerance);

    lastCallPerVault[vault] = block.timestamp;
    lastCall = block.timestamp;
  }

  function maxGasAdjusted() public view returns (uint) {
    uint _maxGas = maxGas;

    uint diff = block.timestamp - lastCall;
    uint multiplier = diff * 100 / 1 days;
    return _maxGas + _maxGas * multiplier / 100;
  }

  function isReadyForCall(address vault, uint _delay) public view returns (bool) {
    uint delayAdjusted = _delay;
    uint _delayRate = delayRate[vault];
    if (_delayRate != 0) {
      delayAdjusted = _delay * _delayRate / DELAY_RATE_DENOMINATOR;
    }

    if (lastCallPerVault[vault] + delayAdjusted < block.timestamp) {
      return true;
    }
    return false;
  }

  function checker() external view returns (bool canExec, bytes memory execPayload) {
    if (tx.gasprice > maxGasAdjusted()) {
      return (false, abi.encodePacked("Too high gas: ", StringLib._toString(tx.gasprice / 1e9)));
    }

    IController _controller = IController(controller());
    uint _delay = delay;
    uint vaultsLength = _controller.vaultsListLength();
    address vaultForCall;
    for (uint i; i < vaultsLength; ++i) {
      address vault = _controller.vaults(i);
      if (!excludedVaults[vault] && isReadyForCall(vault, _delay)) {

        // if at least 2 strategies is active and have positive balance
        uint eligibleStrategies;
        ISplitter splitter = ITetuVaultV2(vault).splitter();
        for (uint k; k < splitter.strategiesLength(); ++k) {

          IStrategyV2 strategy = IStrategyV2(splitter.strategies(k));
          uint totalAssets = strategy.totalAssets();
          uint capacity = splitter.getStrategyCapacity(address(strategy));

          if (
            totalAssets < capacity
            && totalAssets > 0
            && !splitter.pausedStrategies(address(strategy))
          && splitter.lastHardWorks(address(strategy)) + 1 days > block.timestamp
          ) {
            eligibleStrategies++;
            if (eligibleStrategies > 1) {
              break;
            }
          }

        }

        if (eligibleStrategies > 1) {
          vaultForCall = vault;
          break;
        }
      }
    }
    if (vaultForCall == address(0)) {
      return (false, bytes("No ready vaults"));
    } else {
      return (true, abi.encodeWithSelector(SplitterRebalanceResolver.call.selector, vaultForCall));
    }
  }

}
