// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/ISplitter.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../proxy/ControllableV3.sol";

contract MockSplitter is ISplitter, ControllableV3 {

  address public override asset;
  address public override vault;
  uint public slippage;
  address[] public strategies;
  uint public constant HARDWORK_DELAY = 12 hours;
  mapping(address => bool) public pausedStrategies;
  mapping(address => uint) public lastHardWorks;

  function init(address controller_, address _asset, address _vault) external initializer override {
    __Controllable_init(controller_);
    asset = _asset;
    vault = _vault;
  }

  function registerStrategyLoss(uint /*earned*/, uint /*lost*/) external pure {
    // noop
  }

  function pauseInvesting(address strategy) external {
    require(!pausedStrategies[strategy], "SS: Paused");
    pausedStrategies[strategy] = true;
  }

  function continueInvesting(address strategy, uint /*apr*/) external {
    require(pausedStrategies[strategy], "SS: Not paused");
    pausedStrategies[strategy] = false;
  }

  function setSlippage(uint value) external {
    slippage = value;
  }

  function withdrawAllToVault() external override {
    withdrawToVault(IERC20(asset).balanceOf(address(this)));
  }

  function withdrawToVault(uint256 amount) public override {
    uint toSend = amount - amount * slippage / 1000;
    if (slippage != 0) {
      IERC20(asset).transfer(controller(), amount - toSend);
    }
    IERC20(asset).transfer(vault, toSend);
  }

  function doHardWork() external override {
    // noop
  }

  function investAll() external override {
    // noop
  }

  function totalAssets() external view override returns (uint256) {
    return IERC20(asset).balanceOf(address(this));
  }

  function isHardWorking() external pure override returns (bool) {
    return false;
  }

  function lost(uint amount) external {
    IERC20(asset).transfer(msg.sender, amount);
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_SPLITTER || super.supportsInterface(interfaceId);
  }

  function strategiesLength() external view returns (uint) {
    return strategies.length;
  }

  function rebalance(uint /*percent*/, uint /*lossTolerance*/) external pure override {}
  function getStrategyCapacity(address /*strategy*/) external pure override returns (uint) {return 0;}
}
