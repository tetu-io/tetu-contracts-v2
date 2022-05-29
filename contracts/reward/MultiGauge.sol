// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./StakelessMultiPoolBase.sol";
import "../proxy/ControllableV3.sol";
import "../interfaces/IVoter.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IGauge.sol";


contract MultiGauge is StakelessMultiPoolBase, ControllableV3, IGauge {

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant MULTI_GAUGE_VERSION = "1.0.0";

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev The ve token used for gauges
  address public ve;
  address public bribe;
  address public voter;

  mapping(address => mapping(address => uint)) public veIds;
  mapping(address => bool) stakingTokens;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Deposit(address indexed stakingToken, address indexed account, uint amount, uint veId);
  event Withdraw(address indexed stakingToken, address indexed account, uint amount, bool full, uint veId);
  event ClaimFees(address indexed from, uint claimed0, uint claimed1);
  event VeTokenLocked(address indexed stakingToken, address indexed account, uint tokenId);
  event VeTokenUnlocked(address indexed stakingToken, address indexed account, uint tokenId);

  // *************************************************************
  //                        INIT
  // *************************************************************

  function init(
    address controller_,
    address _operator,
    address _bribe,
    address _ve,
    address _voter
  ) external initializer {
    __Controllable_init(controller_);
    __MultiPool_init(_operator);
    bribe = _bribe;
    ve = _ve;
    voter = _voter;
  }

  // *************************************************************
  //                        OPERATOR ACTIONS
  // *************************************************************

  /// @dev Operator can whitelist token. Removing is forbidden.
  function addStakingToken(address token) external onlyOperator {
    stakingTokens[token] = true;
  }

  // *************************************************************
  //                        CLAIMS
  // *************************************************************

  function getReward(
    address stakingToken,
    address account,
    address[] memory tokens
  ) external override {
    _getReward(stakingToken, account, tokens);
  }

  function getAllRewards(
    address stakingToken,
    address account
  ) external override {
    address[] memory tokens = rewardTokens[stakingToken];
    _getReward(stakingToken, account, tokens);
  }

  function getAllRewardsForTokens(
    address[] memory _stakingTokens,
    address account
  ) external override {
    for (uint i; i < _stakingTokens.length; i++) {
      address[] memory tokens = rewardTokens[_stakingTokens[i]];
      _getReward(_stakingTokens[i], account, tokens);
    }
  }

  function _getReward(address stakingToken, address account, address[] memory tokens) internal {
    IVoter(voter).distribute(stakingToken, address(this));
    _getReward(stakingToken, account, tokens, account);
  }

  // *************************************************************
  //                   VIRTUAL DEPOSIT/WITHDRAW
  // *************************************************************

  /// @dev Must be called from stakingToken when user balance changed.
  function handleBalanceChange(address account, uint veId) external override {
    address stakingToken = msg.sender;
    require(isStakeToken(stakingToken), "Forbidden");

    uint stakedBalance = balanceOf[stakingToken][account];
    uint actualBalance = IERC20(stakingToken).balanceOf(account);
    if (stakedBalance < actualBalance) {
      _deposit(stakingToken, account, actualBalance - stakedBalance, veId);
    } else if (stakedBalance > actualBalance) {
      _withdraw(stakingToken, account, stakedBalance - actualBalance, actualBalance == 0);
    }
  }

  function _deposit(
    address stakingToken,
    address account,
    uint amount,
    uint veId
  ) internal {
    if (veId > 0) {
      _lockVeToken(stakingToken, account, veId);
    }
    _registerBalanceIncreasing(stakingToken, account, amount);
    emit Deposit(stakingToken, account, amount, veId);
  }

  function _withdraw(
    address stakingToken,
    address account,
    uint amount,
    bool fullWithdraw
  ) internal {
    uint veId = 0;
    if (fullWithdraw) {
      veId = veIds[stakingToken][account];
    }
    if (veId > 0) {
      _unlockVeToken(stakingToken, account, veId);
    }
    _registerBalanceDecreasing(stakingToken, account, amount);
    emit Withdraw(
      stakingToken,
      account,
      amount,
      fullWithdraw,
      veId
    );
  }

  /// @dev Balance should be recalculated after the lock
  ///      For locking a new ve token withdraw all funds and deposit again
  function _lockVeToken(address stakingToken, address account, uint tokenId) internal {
    require(IERC721(ve).ownerOf(tokenId) == account, "Not ve token owner");
    if (veIds[stakingToken][account] == 0) {
      veIds[stakingToken][account] = tokenId;
      IVoter(voter).attachTokenToGauge(tokenId, account);
    }
    require(veIds[stakingToken][account] == tokenId, "Wrong token");
    emit VeTokenLocked(stakingToken, account, tokenId);
  }

  /// @dev Balance should be recalculated after the unlock
  function _unlockVeToken(address stakingToken, address account, uint veId) internal {
    require(veId == veIds[stakingToken][account], "Wrong token");
    veIds[stakingToken][account] = 0;
    IVoter(voter).detachTokenFromGauge(veId, account);
    emit VeTokenUnlocked(stakingToken, account, veId);
  }

  // *************************************************************
  //                   LOGIC OVERRIDES
  // *************************************************************

  /// @dev Similar to Curve https://resources.curve.fi/reward-gauges/boosting-your-crv-rewards#formula
  function _derivedBalance(
    address stakingToken,
    address account
  ) internal override view returns (uint) {
    uint _tokenId = veIds[stakingToken][account];
    uint _balance = balanceOf[stakingToken][account];
    uint _derived = _balance * 40 / 100;
    uint _adjusted = 0;
    uint _supply = IERC20(ve).totalSupply();
    if (account == IERC721(ve).ownerOf(_tokenId) && _supply > 0) {
      _adjusted = (totalSupply[stakingToken] * IVeTetu(ve).balanceOfNFT(_tokenId) / _supply) * 60 / 100;
    }
    return Math.min((_derived + _adjusted), _balance);
  }

  function isStakeToken(address token) public view override returns (bool) {
    return stakingTokens[token];
  }

  // *************************************************************
  //                   REWARDS DISTRIBUTION
  // *************************************************************

  function notifyRewardAmount(address stakingToken, address token, uint amount) external override {
    _notifyRewardAmount(stakingToken, token, amount);
  }

}
