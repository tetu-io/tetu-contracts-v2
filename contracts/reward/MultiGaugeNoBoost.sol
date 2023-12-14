// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IVoter.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IGauge.sol";
import "../proxy/ControllableV3.sol";
import "./StakelessMultiPoolBase.sol";

/// @title Stakeless pool for vaults without ve integration
/// @author belbix
contract MultiGaugeNoBoost is StakelessMultiPoolBase, IGauge {

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

  /// @dev Staking token => whitelist status
  mapping(address => bool) public stakingTokens;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event AddStakingToken(address token);
  event Deposit(address indexed stakingToken, address indexed account, uint amount);
  event Withdraw(address indexed stakingToken, address indexed account, uint amount, bool full, uint veId);

  // *************************************************************
  //                        INIT
  // *************************************************************

  function init(
    address controller_,
    address _defaultRewardToken
  ) external initializer {
    __MultiPool_init(controller_, _defaultRewardToken, 7 days);
  }

  // *************************************************************
  //                    OPERATOR ACTIONS
  // *************************************************************

  /// @dev Allowed contracts can whitelist token. Removing is forbidden.
  function addStakingToken(address token) external onlyAllowedContracts {
    stakingTokens[token] = true;
    emit AddStakingToken(token);
  }

  // *************************************************************
  //                        CLAIMS
  // *************************************************************

  function getReward(
    address stakingToken,
    address account,
    address[] memory tokens
  ) external {
    _getReward(stakingToken, account, tokens);
  }

  function getAllRewards(
    address stakingToken,
    address account
  ) external {
    _getAllRewards(stakingToken, account);
  }

  function _getAllRewards(
    address stakingToken,
    address account
  ) internal {
    address[] storage rts = rewardTokens[stakingToken];
    uint length = rts.length;
    address[] memory tokens = new address[](length + 1);
    for (uint i; i < length; ++i) {
      tokens[i] = rts[i];
    }
    tokens[length] = defaultRewardToken;
    _getReward(stakingToken, account, tokens);
  }

  function getAllRewardsForTokens(
    address[] memory _stakingTokens,
    address account
  ) external {
    for (uint i; i < _stakingTokens.length; i++) {
      _getAllRewards(_stakingTokens[i], account);
    }
  }

  function _getReward(address stakingToken, address account, address[] memory tokens) internal {
    _getReward(stakingToken, account, tokens, account);
  }

  // *************************************************************
  //                   VIRTUAL DEPOSIT/WITHDRAW
  // *************************************************************

  /// @dev Must be called from stakingToken when user balance changed.
  function handleBalanceChange(address account) external {
    address stakingToken = msg.sender;
    require(isStakeToken(stakingToken), "Wrong staking token");

    uint stakedBalance = balanceOf[stakingToken][account];
    uint actualBalance = IERC20(stakingToken).balanceOf(account);
    if (stakedBalance < actualBalance) {
      _deposit(stakingToken, account, actualBalance - stakedBalance);
    } else if (stakedBalance > actualBalance) {
      _withdraw(stakingToken, account, stakedBalance - actualBalance, actualBalance == 0);
    }
  }

  function _deposit(
    address stakingToken,
    address account,
    uint amount
  ) internal {
    _registerBalanceIncreasing(stakingToken, account, amount);
    emit Deposit(stakingToken, account, amount);
  }

  function _withdraw(
    address stakingToken,
    address account,
    uint amount,
    bool fullWithdraw
  ) internal {
    _registerBalanceDecreasing(stakingToken, account, amount);
    emit Withdraw(
      stakingToken,
      account,
      amount,
      fullWithdraw,
      0
    );
  }

  // *************************************************************
  //                   LOGIC OVERRIDES
  // *************************************************************

  function isStakeToken(address token) public view override returns (bool) {
    return stakingTokens[token];
  }

  // *************************************************************
  //                   REWARDS DISTRIBUTION
  // *************************************************************

  function notifyRewardAmount(address stakingToken, address token, uint amount) external nonReentrant {
    _notifyRewardAmount(stakingToken, token, amount, true);
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override(StakelessMultiPoolBase) returns (bool) {
    return interfaceId == InterfaceIds.I_GAUGE || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                        LEGACY
  // *************************************************************

  function attachVe(address /*stakingToken*/, address /*account*/, uint /*veId*/) external pure override {
    // noop
  }

  function detachVe(address /*stakingToken*/, address /*account*/, uint /*veId*/) external pure override {
    // noop
  }

  function veIds(address /*stakingToken*/, address /*account*/) external pure override returns (uint) {
    // noop
    return 0;
  }

}
