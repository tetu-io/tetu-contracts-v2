// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IVeTetu.sol";
import "../interfaces/IVoter.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IGauge.sol";
import "../interfaces/IBribeFactory.sol";
import "../interfaces/IGaugeFactory.sol";
import "../interfaces/IBribe.sol";
import "../interfaces/IMultiPool.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../proxy/ControllableV3.sol";
import "../openzeppelin/EnumerableSet.sol";

contract TetuVoter is ReentrancyGuard, ControllableV3 {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VOTER_VERSION = "1.0.0";
  /// @dev Rewards are released over 7 days
  uint internal constant _DURATION = 7 days;
  uint internal constant _MAX_VOTES = 10;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev The ve token that governs these contracts
  address public ve;
  address public token;
  address public gauge;
  address public bribe;

  // --- VOTES

  /// @dev Total voting weight
  uint public totalWeight;
  /// @dev vault => weight
  mapping(address => int256) public weights;
  /// @dev nft => vault => votes
  mapping(uint => mapping(address => int256)) public votes;
  /// @dev nft => vaults addresses voted for
  mapping(uint => address[]) public vaultsVotes;
  /// @dev nft => total voting weight of user
  mapping(uint => uint) public usedWeights;

  // --- ATTACHMENTS

  /// @dev veId => Attached staking token
  mapping(uint => EnumerableSet.AddressSet) private attachedStakingTokens;

  // --- REWARDS

  /// @dev Global index for accumulated distro
  uint public index;
  /// @dev vault => Saved global index for accumulated distro
  mapping(address => uint) public supplyIndex;
  /// @dev vault => Available to distribute reward amount
  mapping(address => uint) public claimable;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event GaugeCreated(address indexed gauge, address creator, address indexed bribe, address indexed pool);
  event Voted(address indexed voter, uint tokenId, int256 weight);
  event Abstained(uint tokenId, int256 weight);
  event Deposit(address indexed lp, address indexed gauge, uint tokenId, uint amount);
  event Withdraw(address indexed lp, address indexed gauge, uint tokenId, uint amount);
  event NotifyReward(address indexed sender, address indexed reward, uint amount);
  event DistributeReward(address indexed sender, address indexed gauge, uint amount);
  event Attach(address indexed owner, address indexed gauge, address indexed stakingToken, uint tokenId);
  event Detach(address indexed owner, address indexed gauge, address indexed stakingToken, uint tokenId);
  event Whitelisted(address indexed whitelister, address indexed token);

  // *************************************************************
  //                        INIT
  // *************************************************************

  function init(
    address controller,
    address _ve,
    address _rewardToken,
    address _gauge,
    address _bribe
  ) external initializer {
    __Controllable_init(controller);
    ve = _ve;
    token = _rewardToken;
    gauge = _gauge;
    bribe = _bribe;
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  function isVault(address _vault) public view returns (bool) {
    return IController(controller()).isValidVault(_vault);
  }

  function validVaults() public view returns (address[] memory) {
    return IController(controller()).vaultsList();
  }

  function validVaultsLength() public view returns (uint) {
    return IController(controller()).vaultsListLength();
  }

  // *************************************************************
  //                     GOV ACTIONS
  // *************************************************************

  // *************************************************************
  //                        VOTES
  // *************************************************************

  /// @dev Remove all votes for given tokenId.
  ///      Ve token should be able to remove votes on transfer/withdraw
  function reset(uint _tokenId) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, _tokenId) || msg.sender == ve, "!owner");
    _reset(_tokenId);
    IVeTetu(ve).abstain(_tokenId);
  }

  /// @dev Vote for given pools using a vote power of given tokenId. Reset previous votes.
  function vote(uint tokenId, address[] calldata _vaultVotes, int256[] calldata _weights) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, tokenId), "!owner");
    require(_vaultVotes.length == _weights.length, "!arrays");
    _vote(tokenId, _vaultVotes, _weights);
  }

  function _vote(uint _tokenId, address[] memory _vaultVotes, int256[] memory _weights) internal {
    _reset(_tokenId);
    uint length = _vaultVotes.length;

    require(length <= _MAX_VOTES, "Too many votes");

    int256 _weight = int256(IVeTetu(ve).balanceOfNFT(_tokenId));
    int256 _totalVoteWeight = 0;
    int256 _totalWeight = 0;
    int256 _usedWeight = 0;

    for (uint i = 0; i < length; i++) {
      _totalVoteWeight += _weights[i] > 0 ? _weights[i] : - _weights[i];
    }

    for (uint i = 0; i < length; i++) {
      address _vault = _vaultVotes[i];
      require(isVault(_vault), "Invalid vault");

      int256 _vaultWeight = _weights[i] * _weight / _totalVoteWeight;
      require(votes[_tokenId][_vault] == 0, "duplicate vault");
      require(_vaultWeight != 0, "zero power");
      _updateFor(_vault);

      vaultsVotes[_tokenId].push(_vault);

      weights[_vault] += _vaultWeight;
      votes[_tokenId][_vault] += _vaultWeight;
      if (_vaultWeight > 0) {
        IBribe(bribe).deposit(_vault, uint(_vaultWeight), _tokenId);
      } else {
        _vaultWeight = - _vaultWeight;
      }
      _usedWeight += _vaultWeight;
      _totalWeight += _vaultWeight;
      emit Voted(msg.sender, _tokenId, _vaultWeight);
    }
    if (_usedWeight > 0) IVeTetu(ve).voting(_tokenId);
    totalWeight += uint(_totalWeight);
    usedWeights[_tokenId] = uint(_usedWeight);
  }

  /// @dev Remove all votes for given veId
  function _reset(uint _tokenId) internal {
    address[] storage _vaultsVotes = vaultsVotes[_tokenId];
    uint length = _vaultsVotes.length;
    int256 _totalWeight = 0;

    for (uint i = 0; i < length; i ++) {
      address _vault = _vaultsVotes[i];
      int256 _votes = votes[_tokenId][_vault];
      _updateFor(_vault);
      weights[_vault] -= _votes;
      votes[_tokenId][_vault] = 0;
      if (_votes > 0) {
        IBribe(bribe).withdraw(_vault, uint(_votes), _tokenId);
        _totalWeight += _votes;
      } else {
        _totalWeight -= _votes;
      }
      emit Abstained(_tokenId, _votes);
    }
    totalWeight -= uint(_totalWeight);
    usedWeights[_tokenId] = 0;
    delete vaultsVotes[_tokenId];
  }

  // *************************************************************
  //                        ATTACH/DETACH
  // *************************************************************

  /// @dev A gauge should be able to attach a token for preventing transfers/withdraws.
  function attachTokenToGauge(address stakingToken, uint tokenId, address account) external  {
    require(gauge == msg.sender, "!gauge");
    if (tokenId > 0) {
      IVeTetu(ve).attachToken(tokenId);
      require(attachedStakingTokens[tokenId].add(stakingToken), "Already attached");
    }
    emit Attach(account, msg.sender, stakingToken, tokenId);
  }

  /// @dev Detach given token.
  function detachTokenFromGauge(address stakingToken, uint tokenId, address account) external  {
    require(gauge == msg.sender, "!gauge");
    if (tokenId > 0) {
      IVeTetu(ve).detachToken(tokenId);
      require(attachedStakingTokens[tokenId].remove(stakingToken), "Attach not found");
    }
    emit Detach(account, msg.sender, stakingToken, tokenId);
  }

  /// @dev Detach given token from all gauges and votes
  ///      It could be pretty expensive call.
  ///      Need to have restrictions for max attached tokens and votes.
  function detachTokenFromAll(uint tokenId, address account) external  {
    require(msg.sender == ve, "!ve");

    _reset(tokenId);

    EnumerableSet.AddressSet storage tokens = attachedStakingTokens[tokenId];
    uint length = tokens.length();
    for (uint i; i < length; ++i) {
      address stakingToken = tokens.at(i);
      IGauge(gauge).detachVe(stakingToken, account, tokenId);
    }
  }

  // *************************************************************
  //                    UPDATE INDEXES
  // *************************************************************

  /// @dev Update given vaults.
  function updateFor(address[] memory _vaults) external {
    for (uint i = 0; i < _vaults.length; i++) {
      _updateFor(_vaults[i]);
    }
  }

  /// @dev Update vaults by indexes in a range.
  function updateForRange(uint start, uint end) public {
    address[] memory _vaults = validVaults();
    for (uint i = start; i < end; i++) {
      _updateFor(_vaults[i]);
    }
  }

  /// @dev Update all gauges.
  function updateAll() external {
    updateForRange(0, validVaultsLength());
  }

  /// @dev Update reward info for given gauge.
  function updateVault(address _vault) external {
    _updateFor(_vault);
  }

  function _updateFor(address _vault) internal {
    int256 _supplied = weights[_vault];
    if (_supplied > 0) {
      uint _supplyIndex = supplyIndex[_vault];
      // get global index for accumulated distro
      uint _index = index;
      // update vault current position to global position
      supplyIndex[_vault] = _index;
      // see if there is any difference that need to be accrued
      uint _delta = _index - _supplyIndex;
      if (_delta > 0) {
        // add accrued difference for each supplied token
        uint _share = uint(_supplied) * _delta / 1e18;
        claimable[_vault] += _share;
      }
    } else {
      // new users are set to the default global state
      supplyIndex[_vault] = index;
    }
  }

  // *************************************************************
  //                        REWARDS
  // *************************************************************

  /// @dev Add rewards to this contract. It will be distributed to vaults.
  function notifyRewardAmount(uint amount) external {
    require(amount != 0, "zero amount");
    uint _totalWeight = totalWeight;
    // without votes rewards can not be added
    require(_totalWeight != 0, "!weights");
    // transfer the distro in
    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    // 1e18 adjustment is removed during claim
    uint _ratio = amount * 1e18 / _totalWeight;
    if (_ratio > 0) {
      index += _ratio;
    }
    emit NotifyReward(msg.sender, token, amount);
  }

  /// @dev Notify rewards for given vault. Anyone can call
  function distribute(address _vault) external {
    _distribute(_vault);
  }

  /// @dev Distribute rewards to all valid vaults.
  function distributeAll() external {
    uint length = validVaultsLength();
    address[] memory _vaults = validVaults();
    for (uint x; x < length; x++) {
      _distribute(_vaults[x]);
    }
  }

  function distributeFor(uint start, uint finish) external {
    address[] memory _vaults = validVaults();
    for (uint x = start; x < finish; x++) {
      _distribute(_vaults[x]);
    }
  }

  function _distribute(address _vault) internal nonReentrant {
    _updateFor(_vault);
    uint _claimable = claimable[_vault];
    if (_claimable / _DURATION > 0) {
      claimable[_vault] = 0;
      IGauge(gauge).notifyRewardAmount(_vault, token, _claimable);
      emit DistributeReward(msg.sender, _vault, _claimable);
    }
  }
}