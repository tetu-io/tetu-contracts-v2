// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../reward/StakelessMultiPoolBase.sol";
import "../proxy/ControllableV3.sol";


contract StakelessMultiPoolMock is StakelessMultiPoolBase, ControllableV3 {

  mapping(address => bool) public stakingTokens;

  function init(
    address controller_,
    address _operator,
    address[] memory _stakingTokens,
    address _defaultRewardToken
  ) external initializer {
    __Controllable_init(controller_);
    __MultiPool_init(_operator, _defaultRewardToken);
    for (uint i; i < _stakingTokens.length; i++) {
      stakingTokens[_stakingTokens[i]] = true;
    }
  }

  // for test 2 deposits in one tx
  function testDoubleDeposit(address stakingToken, uint amount) external {
    uint amount0 = amount / 2;
    uint amount1 = amount - amount0;
    _registerBalanceIncreasing(stakingToken, msg.sender, amount0);
    _registerBalanceIncreasing(stakingToken, msg.sender, amount1);
  }

  // for test 2 withdraws in one tx
  function testDoubleWithdraw(address stakingToken, uint amount) external {
    uint amount0 = amount / 2;
    uint amount1 = amount - amount0;
    _registerBalanceDecreasing(stakingToken, msg.sender, amount0);
    _registerBalanceDecreasing(stakingToken, msg.sender, amount1);
  }

  function deposit(address stakingToken, uint amount) external {
    _registerBalanceIncreasing(stakingToken, msg.sender, amount);
  }

  function withdraw(address stakingToken, uint amount) external {
    _registerBalanceDecreasing(stakingToken, msg.sender, amount);
  }

  function getReward(address stakingToken, address account, address[] memory tokens) external {
    require(msg.sender == account, "Forbidden");
    _getReward(stakingToken, account, tokens, account);
  }

  function notifyRewardAmount(address stakingToken, address token, uint amount) external {
    _notifyRewardAmount(stakingToken, token, amount);
  }

  function isStakeToken(address token) public view override returns (bool) {
    return stakingTokens[token];
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override(ControllableV3, StakelessMultiPoolBase) returns (bool) {
    return interfaceId == InterfaceIds.I_MULTI_POOL || super.supportsInterface(interfaceId);
  }

}
