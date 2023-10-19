// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IStrategyV2.sol";
import "../proxy/ControllableV3.sol";
import "./../lib/StringLib.sol";

/// @title Gelato resolver for hardworks
/// @author a17
contract HardWorkResolver is ControllableV3 {
  // --- CONSTANTS ---

  string public constant VERSION = "1.0.0";
  uint public constant DELAY_RATE_DENOMINATOR = 100_000;

  // --- VARIABLES ---

  address public owner;
  address public pendingOwner;
  uint public delay;
  uint public maxGas;
  uint public maxHwPerCall;

  mapping(address => uint) public delayRate;
  mapping(address => bool) public operators;
  mapping(address => bool) public excludedVaults;
  uint public lastHWCall;

  // --- INIT ---

  function init(address controller_) external initializer {
    ControllableV3.__Controllable_init(controller_);

    owner = msg.sender;
    delay = 1 days;
    maxGas = 35 gwei;
    maxHwPerCall = 5;
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

  function setMaxHwPerCall(uint value) external onlyOwner {
    maxHwPerCall = value;
  }

  function setDelayRate(address[] memory _vaults, uint value) external onlyOwner {
    for (uint i; i < _vaults.length; ++i) {
      delayRate[_vaults[i]] = value;
    }
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

  function lastHW(address vault) public view returns (uint lastHardWorkTimestamp) {
    // hide warning
    lastHardWorkTimestamp = 0;
    ISplitter splitter = ITetuVaultV2(vault).splitter();
    for (uint k; k < splitter.strategiesLength(); ++k) {
      IStrategyV2 strategy = IStrategyV2(splitter.strategies(k));
      if (
        !splitter.pausedStrategies(address(strategy)) && strategy.totalAssets() > 0
        && (lastHardWorkTimestamp == 0 || lastHardWorkTimestamp > splitter.lastHardWorks(address(strategy)))
      ) {
        lastHardWorkTimestamp = splitter.lastHardWorks(address(strategy));
      }
    }
  }

  function call(address[] memory _vaults) external returns (uint amountOfCalls) {
    require(operators[msg.sender], "!operator");

    uint _maxHwPerCall = maxHwPerCall;
    uint vaultsLength = _vaults.length;
    uint counter;
    for (uint i; i < vaultsLength; ++i) {
      address vault = _vaults[i];

      ISplitter splitter = ITetuVaultV2(vault).splitter();

      try splitter.doHardWork() {} catch Error(string memory _err) {
        revert(string(abi.encodePacked("Vault error: 0x", StringLib._toAsciiString(vault), " ", _err)));
      } catch (bytes memory _err) {
        revert(string(abi.encodePacked("Vault low-level error: 0x", StringLib._toAsciiString(vault), " ", string(_err))));
      }
      counter++;
      if (counter >= _maxHwPerCall) {
        break;
      }
    }

    lastHWCall = block.timestamp;
    return counter;
  }

  function maxGasAdjusted() public view returns (uint) {
    uint _maxGas = maxGas;

    uint diff = block.timestamp - lastHWCall;
    uint multiplier = diff * 100 / 1 days;
    return _maxGas + _maxGas * multiplier / 100;
  }

  function checker() external view returns (bool canExec, bytes memory execPayload) {
    if (tx.gasprice > maxGasAdjusted()) {
      return (false, abi.encodePacked("Too high gas: ", StringLib._toString(tx.gasprice / 1e9)));
    }

    IController _controller = IController(controller());
    uint _delay = delay;
    uint vaultsLength = _controller.vaultsListLength();
    address[] memory _vaults = new address[](vaultsLength);
    uint counter;
    for (uint i; i < vaultsLength; ++i) {
      address vault = _controller.vaults(i);
      if (!excludedVaults[vault]) {

        bool strategyNeedHardwork;
        ISplitter splitter = ITetuVaultV2(vault).splitter();
        for (uint k; k < splitter.strategiesLength(); ++k) {
          IStrategyV2 strategy = IStrategyV2(splitter.strategies(k));
          if (
            strategy.isReadyToHardWork()
            && splitter.lastHardWorks(address(strategy)) + splitter.HARDWORK_DELAY() < block.timestamp
            && !splitter.pausedStrategies(address(strategy))
            && strategy.totalAssets() > 0
          ) {
            strategyNeedHardwork = true;
            break;
          }
        }

        uint delayAdjusted = _delay;
        uint _delayRate = delayRate[vault];
        if (_delayRate != 0) {
          delayAdjusted = _delay * _delayRate / DELAY_RATE_DENOMINATOR;
        }

        if (strategyNeedHardwork && lastHW(vault) + delayAdjusted < block.timestamp) {
          _vaults[i] = vault;
          counter++;
        }
      }
    }
    if (counter == 0) {
      return (false, bytes("No ready vaults"));
    } else {
      address[] memory vaultsResult = new address[](counter);
      uint j;
      for (uint i; i < vaultsLength; ++i) {
        if (_vaults[i] != address(0)) {
          vaultsResult[j] = _vaults[i];
          ++j;
        }
      }
      return (true, abi.encodeWithSelector(HardWorkResolver.call.selector, vaultsResult));
    }
  }

}
