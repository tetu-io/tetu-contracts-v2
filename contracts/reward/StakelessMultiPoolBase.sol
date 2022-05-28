// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IERC20.sol";
import "../openzeppelin/Math.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../lib/CheckpointLib.sol";
import "../interfaces/IMultiPool.sol";

abstract contract StakelessMultiPoolBase is ReentrancyGuard, IMultiPool {
  using SafeERC20 for IERC20;
  using CheckpointLib for mapping(uint => CheckpointLib.Checkpoint);

  /// @dev Rewards are released over 7 days
  uint internal constant DURATION = 7 days;
  uint internal constant PRECISION = 10 ** 18;
  uint internal constant MAX_REWARD_TOKENS = 10;

  /// @dev Operator can add/remove reward tokens
  address public operator;

  mapping(address => uint) public override derivedSupply;
  mapping(address => mapping(address => uint)) public override derivedBalances;
  mapping(address => mapping(address => uint)) public override balanceOf;

  /// @dev Reward rate with precision 1e18
  mapping(address => mapping(address => uint)) public rewardRate;
  mapping(address => mapping(address => uint)) public periodFinish;
  mapping(address => mapping(address => uint)) public lastUpdateTime;
  mapping(address => mapping(address => uint)) public rewardPerTokenStored;

  mapping(address => mapping(address => mapping(address => uint))) public lastEarn;
  mapping(address => mapping(address => mapping(address => uint))) public userRewardPerTokenStored;

  mapping(address => address[]) public override rewardTokens;
  mapping(address => mapping(address => bool)) public override isRewardToken;

  /// @notice A record of balance checkpoints for each account, by index
  mapping(address => mapping(address => mapping(uint => CheckpointLib.Checkpoint))) public checkpoints;
  /// @notice The number of checkpoints for each account
  mapping(address => mapping(address => uint)) public numCheckpoints;
  /// @notice A record of balance checkpoints for each token, by index
  mapping(address => mapping(uint => CheckpointLib.Checkpoint)) public supplyCheckpoints;
  /// @notice The number of checkpoints
  mapping(address => uint) public supplyNumCheckpoints;
  /// @notice A record of balance checkpoints for each token, by index
  mapping(address => mapping(address => mapping(uint => CheckpointLib.Checkpoint))) public rewardPerTokenCheckpoints;
  /// @notice The number of checkpoints for each token
  mapping(address => mapping(address => uint)) public rewardPerTokenNumCheckpoints;

  event BalanceIncreased(address indexed token, address indexed account, uint amount);
  event BalanceDecreased(address indexed token, address indexed account, uint amount);
  event NotifyReward(address indexed from, address token, address indexed reward, uint amount);
  event ClaimRewards(address indexed from, address token, address indexed reward, uint amount, address recepient);

  constructor(address _operator) {
    operator = _operator;
  }

  modifier onlyOperator() {
    require(msg.sender == operator, "Not operator");
    _;
  }

  //**************************************************************************
  //                            VIEWS
  //**************************************************************************

  /// @dev Should return true for whitelisted for rewards tokens
  function isStakeToken(address token) public view override virtual returns (bool);

  /// @dev Length of rewards tokens array for given token
  function rewardTokensLength(address token) external view override returns (uint) {
    return rewardTokens[token].length;
  }

  /// @dev Reward paid for token for the current period.
  function rewardPerToken(address stakeToken, address rewardToken) public view returns (uint) {
    uint _derivedSupply = derivedSupply[stakeToken];
    if (_derivedSupply == 0) {
      return rewardPerTokenStored[stakeToken][rewardToken];
    }
    return rewardPerTokenStored[stakeToken][rewardToken]
    + (
    (_lastTimeRewardApplicable(stakeToken, rewardToken)
    - Math.min(lastUpdateTime[stakeToken][rewardToken], periodFinish[stakeToken][rewardToken]))
    * rewardRate[stakeToken][rewardToken]
    / _derivedSupply
    );
  }

  /// @dev Balance of holder adjusted with specific rules for boost calculation.
  function derivedBalance(address token, address account) external view override returns (uint) {
    return _derivedBalance(token, account);
  }

  /// @dev Amount of reward tokens left for the current period
  function left(address stakeToken, address rewardToken) external view override returns (uint) {
    uint _periodFinish = periodFinish[stakeToken][rewardToken];
    if (block.timestamp >= _periodFinish) return 0;
    uint _remaining = _periodFinish - block.timestamp;
    return _remaining * rewardRate[stakeToken][rewardToken] / PRECISION;
  }

  /// @dev Approximate of earned rewards ready to claim
  function earned(address stakeToken, address rewardToken, address account) external view override returns (uint) {
    return _earned(stakeToken, rewardToken, account);
  }

  //**************************************************************************
  //************************ OPERATOR ACTIONS ********************************
  //**************************************************************************

  function registerRewardToken(address stakeToken, address rewardToken) external override onlyOperator {
    _registerRewardToken(stakeToken, rewardToken);
  }

  function _registerRewardToken(address stakeToken, address rewardToken) internal {
    require(rewardTokens[stakeToken].length < MAX_REWARD_TOKENS, "Too many reward tokens");
    require(!isRewardToken[stakeToken][rewardToken], "Already registered");
    isRewardToken[stakeToken][rewardToken] = true;
    rewardTokens[stakeToken].push(rewardToken);
  }

  function removeRewardToken(address stakeToken, address rewardToken) external override onlyOperator {
    require(periodFinish[stakeToken][rewardToken] < block.timestamp, "Rewards not ended");
    require(isRewardToken[stakeToken][rewardToken], "Not reward token");

    isRewardToken[stakeToken][rewardToken] = false;
    uint length = rewardTokens[stakeToken].length;
    require(length > 1, "First token should not be removed");
    // keep the first token as guarantee against malicious actions
    // assume it will be default platform token
    uint i = 1;
    bool found = false;
    for (; i < length; i++) {
      address t = rewardTokens[stakeToken][i];
      if (t == rewardToken) {
        found = true;
        break;
      }
    }
    require(found, "First token forbidden to remove");
    rewardTokens[stakeToken][i] = rewardTokens[stakeToken][length - 1];
    rewardTokens[stakeToken].pop();
  }

  //**************************************************************************
  //************************ USER ACTIONS ************************************
  //**************************************************************************

  /// @dev Assume to be called when linked token balance changes.
  function _registerBalanceIncreasing(
    address stakingToken,
    address account,
    uint amount
  ) internal virtual nonReentrant {
    require(isStakeToken(stakingToken), "Zero amount");
    require(amount > 0, "Zero amount");

    _increaseBalance(stakingToken, account, amount);
    emit BalanceIncreased(stakingToken, account, amount);
  }

  function _increaseBalance(
    address stakingToken,
    address account,
    uint amount
  ) internal virtual {
    _updateRewardForAllTokens(stakingToken);
    balanceOf[stakingToken][account] += amount;
    _updateDerivedBalanceAndWriteCheckpoints(stakingToken, account);
  }

  /// @dev Assume to be called when linked token balance changes.
  function _registerBalanceDecreasing(
    address stakingToken,
    address account,
    uint amount
  ) internal nonReentrant virtual {
    _decreaseBalance(stakingToken, account, amount);
    emit BalanceDecreased(stakingToken, account, amount);
  }

  function _decreaseBalance(
    address stakingToken,
    address account,
    uint amount
  ) internal virtual {
    _updateRewardForAllTokens(stakingToken);
    balanceOf[stakingToken][account] -= amount;
    _updateDerivedBalanceAndWriteCheckpoints(stakingToken, account);
  }

  /// @dev Caller should implement restriction checks
  function _getReward(
    address stakingToken,
    address account,
    address[] memory rewardTokens_,
    address recipient
  ) internal nonReentrant virtual {
    for (uint i = 0; i < rewardTokens_.length; i++) {
      (rewardPerTokenStored[stakingToken][rewardTokens_[i]], lastUpdateTime[stakingToken][rewardTokens_[i]])
      = _updateRewardPerToken(stakingToken, rewardTokens_[i], type(uint).max, true);

      uint _reward = _earned(stakingToken, rewardTokens_[i], account);
      lastEarn[stakingToken][rewardTokens_[i]][account] = block.timestamp;
      userRewardPerTokenStored[stakingToken][rewardTokens_[i]][account] = rewardPerTokenStored[stakingToken][rewardTokens_[i]];
      if (_reward > 0) {
        IERC20(rewardTokens_[i]).safeTransfer(recipient, _reward);
      }

      emit ClaimRewards(account, stakingToken, rewardTokens_[i], _reward, recipient);
    }

    _updateDerivedBalanceAndWriteCheckpoints(stakingToken, account);
  }

  function _updateDerivedBalanceAndWriteCheckpoints(address stakingToken, address account) internal {
    uint __derivedBalance = derivedBalances[stakingToken][account];
    derivedSupply[stakingToken] -= __derivedBalance;
    __derivedBalance = _derivedBalance(stakingToken, account);
    derivedBalances[stakingToken][account] = __derivedBalance;
    derivedSupply[stakingToken] += __derivedBalance;

    _writeCheckpoint(stakingToken, account, __derivedBalance);
    _writeSupplyCheckpoint(stakingToken);
  }

  //**************************************************************************
  //************************ REWARDS CALCULATIONS ****************************
  //**************************************************************************

  /// @dev Earned is an estimation, it won't be exact till the supply > rewardPerToken calculations have run
  function _earned(
    address stakingToken,
    address rewardToken,
    address account
  ) internal view returns (uint) {
    // zero checkpoints means zero deposits
    if (numCheckpoints[stakingToken][account] == 0) {
      return 0;
    }
    // last claim rewards time
    uint _startTimestamp = Math.max(
      lastEarn[stakingToken][rewardToken][account],
      rewardPerTokenCheckpoints[stakingToken][rewardToken][0].timestamp
    );

    // find an index of the balance that the user had on the last claim
    uint _startIndex = getPriorBalanceIndex(stakingToken, account, _startTimestamp);
    uint _endIndex = numCheckpoints[stakingToken][account] - 1;

    uint reward = 0;

    // calculate previous snapshots if exist
    if (_endIndex > 0) {
      for (uint i = _startIndex; i <= _endIndex - 1; i++) {
        CheckpointLib.Checkpoint memory cp0 = checkpoints[stakingToken][account][i];
        CheckpointLib.Checkpoint memory cp1 = checkpoints[stakingToken][account][i + 1];
        (uint _rewardPerTokenStored0,) = getPriorRewardPerToken(stakingToken, rewardToken, cp0.timestamp);
        (uint _rewardPerTokenStored1,) = getPriorRewardPerToken(stakingToken, rewardToken, cp1.timestamp);
        reward += cp0.value * (_rewardPerTokenStored1 - _rewardPerTokenStored0) / PRECISION;
      }
    }

    CheckpointLib.Checkpoint memory cp = checkpoints[stakingToken][account][_endIndex];
    (uint _rewardPerTokenStored,) = getPriorRewardPerToken(stakingToken, rewardToken, cp.timestamp);
    reward += cp.value * (
    rewardPerToken(stakingToken, rewardToken) - Math.max(
      _rewardPerTokenStored,
      userRewardPerTokenStored[stakingToken][rewardToken][account]
    )
    ) / PRECISION;
    return reward;
  }

  function _derivedBalance(
    address stakingToken,
    address account
  ) internal virtual view returns (uint) {
    // supposed to be implemented in a parent contract
    return balanceOf[stakingToken][account];
  }

  /// @dev Update stored rewardPerToken values without the last one snapshot
  ///      If the contract will get "out of gas" error on users actions this will be helpful
  function batchUpdateRewardPerToken(
    address stakingToken,
    address rewardToken,
    uint maxRuns
  ) external {
    (rewardPerTokenStored[stakingToken][rewardToken], lastUpdateTime[stakingToken][rewardToken])
    = _updateRewardPerToken(stakingToken, rewardToken, maxRuns, false);
  }

  function _updateRewardForAllTokens(address stakingToken) internal {
    uint length = rewardTokens[stakingToken].length;
    for (uint i; i < length; i++) {
      address rewardToken = rewardTokens[stakingToken][i];
      (rewardPerTokenStored[stakingToken][rewardToken], lastUpdateTime[stakingToken][rewardToken])
      = _updateRewardPerToken(stakingToken, rewardToken, type(uint).max, true);
    }
  }

  /// @dev Should be called only with properly updated snapshots, or with actualLast=false
  function _updateRewardPerToken(
    address stakingToken,
    address rewardToken,
    uint maxRuns,
    bool actualLast
  ) internal returns (uint, uint) {
    uint _startTimestamp = lastUpdateTime[stakingToken][rewardToken];
    uint reward = rewardPerTokenStored[stakingToken][rewardToken];

    if (supplyNumCheckpoints[stakingToken] == 0) {
      return (reward, _startTimestamp);
    }

    if (rewardRate[stakingToken][rewardToken] == 0) {
      return (reward, block.timestamp);
    }
    uint _startIndex = getPriorSupplyIndex(stakingToken, _startTimestamp);
    uint _endIndex = Math.min(supplyNumCheckpoints[stakingToken] - 1, maxRuns);

    if (_endIndex > 0) {
      for (uint i = _startIndex; i <= _endIndex - 1; i++) {
        CheckpointLib.Checkpoint memory sp0 = supplyCheckpoints[stakingToken][i];
        if (sp0.value > 0) {
          CheckpointLib.Checkpoint memory sp1 = supplyCheckpoints[stakingToken][i + 1];
          (uint _reward, uint _endTime) = _calcRewardPerToken(
            stakingToken,
            rewardToken,
            sp1.timestamp,
            sp0.timestamp,
            sp0.value,
            _startTimestamp
          );
          reward += _reward;
          _writeRewardPerTokenCheckpoint(stakingToken, rewardToken, reward, _endTime);
          _startTimestamp = _endTime;
        }
      }
    }

    // need to override the last value with actual numbers only on deposit/withdraw/claim/notify actions
    if (actualLast) {
      CheckpointLib.Checkpoint memory sp = supplyCheckpoints[stakingToken][_endIndex];
      if (sp.value > 0) {
        (uint _reward,) = _calcRewardPerToken(
          stakingToken,
          rewardToken,
          _lastTimeRewardApplicable(stakingToken, rewardToken),
          Math.max(sp.timestamp, _startTimestamp),
          sp.value,
          _startTimestamp
        );
        reward += _reward;
        _writeRewardPerTokenCheckpoint(stakingToken, rewardToken, reward, block.timestamp);
        _startTimestamp = block.timestamp;
      }
    }

    return (reward, _startTimestamp);
  }

  function _calcRewardPerToken(
    address stakingToken,
    address token,
    uint lastSupplyTs1,
    uint lastSupplyTs0,
    uint supply,
    uint startTimestamp
  ) internal view returns (uint, uint) {
    uint endTime = Math.max(lastSupplyTs1, startTimestamp);
    uint _periodFinish = periodFinish[stakingToken][token];
    return (
    (Math.min(endTime, _periodFinish) - Math.min(Math.max(lastSupplyTs0, startTimestamp), _periodFinish))
    * rewardRate[stakingToken][token] / supply
    , endTime);
  }

  /// @dev Returns the last time the reward was modified or periodFinish if the reward has ended
  function _lastTimeRewardApplicable(address stakeToken, address rewardToken) internal view returns (uint) {
    return Math.min(block.timestamp, periodFinish[stakeToken][rewardToken]);
  }

  //**************************************************************************
  //************************ NOTIFY ******************************************
  //**************************************************************************

  function _notifyRewardAmount(
    address stakingToken,
    address rewardToken,
    uint amount
  ) internal nonReentrant virtual {
    require(amount > 0, "Zero amount");
    require(isRewardToken[stakingToken][rewardToken], "Token not allowed");
    if (rewardRate[stakingToken][rewardToken] == 0) {
      _writeRewardPerTokenCheckpoint(stakingToken, rewardToken, 0, block.timestamp);
    }
    (rewardPerTokenStored[stakingToken][rewardToken], lastUpdateTime[stakingToken][rewardToken])
    = _updateRewardPerToken(stakingToken, rewardToken, type(uint).max, true);

    if (block.timestamp >= periodFinish[stakingToken][rewardToken]) {
      IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);
      rewardRate[stakingToken][rewardToken] = amount * PRECISION / DURATION;
    } else {
      uint _remaining = periodFinish[stakingToken][rewardToken] - block.timestamp;
      uint _left = _remaining * rewardRate[stakingToken][rewardToken];
      IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);
      rewardRate[stakingToken][rewardToken] = (amount * PRECISION + _left) / DURATION;
    }

    periodFinish[stakingToken][rewardToken] = block.timestamp + DURATION;
    emit NotifyReward(msg.sender, stakingToken, rewardToken, amount);
  }

  //**************************************************************************
  //************************ CHECKPOINTS *************************************
  //**************************************************************************

  /// @notice Determine the prior balance for an account as of a block number
  /// @dev Block number must be a finalized block or else this function will revert to prevent misinformation.
  /// @param stakingToken The address of the staking token to check
  /// @param account The address of the account to check
  /// @param timestamp The timestamp to get the balance at
  /// @return The balance the account had as of the given block
  function getPriorBalanceIndex(
    address stakingToken,
    address account,
    uint timestamp
  ) public view returns (uint) {
    uint nCheckpoints = numCheckpoints[stakingToken][account];
    if (nCheckpoints == 0) {
      return 0;
    }
    return checkpoints[stakingToken][account].findLowerIndex(nCheckpoints, timestamp);
  }

  function getPriorSupplyIndex(address stakingToken, uint timestamp) public view returns (uint) {
    uint nCheckpoints = supplyNumCheckpoints[stakingToken];
    if (nCheckpoints == 0) {
      return 0;
    }
    return supplyCheckpoints[stakingToken].findLowerIndex(nCheckpoints, timestamp);
  }

  function getPriorRewardPerToken(
    address stakingToken,
    address rewardToken,
    uint timestamp
  ) public view returns (uint, uint) {
    uint nCheckpoints = rewardPerTokenNumCheckpoints[stakingToken][rewardToken];
    if (nCheckpoints == 0) {
      return (0, 0);
    }
    mapping(uint => CheckpointLib.Checkpoint) storage cps =
    rewardPerTokenCheckpoints[stakingToken][rewardToken];
    uint lower = cps.findLowerIndex(nCheckpoints, timestamp);
    CheckpointLib.Checkpoint memory cp = cps[lower];
    return (cp.value, cp.timestamp);
  }

  function _writeCheckpoint(
    address stakingToken,
    address account,
    uint balance
  ) internal {
    uint _timestamp = block.timestamp;
    uint _nCheckPoints = numCheckpoints[stakingToken][account];

    if (_nCheckPoints > 0 && checkpoints[stakingToken][account][_nCheckPoints - 1].timestamp == _timestamp) {
      checkpoints[stakingToken][account][_nCheckPoints - 1].value = balance;
    } else {
      checkpoints[stakingToken][account][_nCheckPoints] = CheckpointLib.Checkpoint(_timestamp, balance);
      numCheckpoints[stakingToken][account] = _nCheckPoints + 1;
    }
  }

  function _writeRewardPerTokenCheckpoint(
    address stakingToken,
    address rewardToken,
    uint reward,
    uint timestamp
  ) internal {
    uint _nCheckPoints = rewardPerTokenNumCheckpoints[stakingToken][rewardToken];
    CheckpointLib.Checkpoint storage cp = rewardPerTokenCheckpoints[stakingToken][rewardToken][_nCheckPoints - 1];
    if (_nCheckPoints > 0 && cp.timestamp == timestamp) {
      cp.value = reward;
    } else {
      rewardPerTokenCheckpoints[stakingToken][rewardToken][_nCheckPoints] = CheckpointLib.Checkpoint(timestamp, reward);
      rewardPerTokenNumCheckpoints[stakingToken][rewardToken] = _nCheckPoints + 1;
    }
  }

  function _writeSupplyCheckpoint(address stakingToken) internal {
    uint _nCheckPoints = supplyNumCheckpoints[stakingToken];
    uint _timestamp = block.timestamp;

    CheckpointLib.Checkpoint storage cp = supplyCheckpoints[stakingToken][_nCheckPoints - 1];
    if (_nCheckPoints > 0 && cp.timestamp == _timestamp) {
      cp.value = derivedSupply[stakingToken];
    } else {
      supplyCheckpoints[stakingToken][_nCheckPoints] = CheckpointLib.Checkpoint(_timestamp, derivedSupply[stakingToken]);
      supplyNumCheckpoints[stakingToken] = _nCheckPoints + 1;
    }
  }
}
