// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../interfaces/IForwarder.sol";
import "../interfaces/IPlatformVoter.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IStrategyV2.sol";
import "../proxy/ControllableV3.sol";

/// @title Ve holders can vote for platform attributes values.
/// @author belbix
contract PlatformVoter is ControllableV3, IPlatformVoter {

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant PLATFORM_VOTER_VERSION = "1.0.5";
  /// @dev Denominator for different ratios. It is default for the whole platform.
  uint public constant RATIO_DENOMINATOR = 100_000;
  /// @dev Delay between votes.
  uint public constant VOTE_DELAY = 1 weeks;
  /// @dev Maximum votes per veNFT
  uint public constant MAX_VOTES = 20;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev The ve token that governs these contracts
  address public ve;

  // --- VOTES
  /// @dev veId => votes
  mapping(uint => Vote[]) public votes;
  /// @dev Attribute => Target(zero for not-strategy) => sum of votes weights
  mapping(AttributeType => mapping(address => uint)) public attributeWeights;
  /// @dev Attribute => Target(zero for not-strategy) => sum of weights multiple on values
  mapping(AttributeType => mapping(address => uint)) public attributeValues;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event AttributeChanged(uint _type, uint value);
  event Voted(
    uint tokenId,
    uint _type,
    uint value,
    address target,
    uint veWeight,
    uint veWeightedValue,
    uint totalAttributeWeight,
    uint totalAttributeValue,
    uint newValue
  );
  event VoteReset(
    uint tokenId,
    uint _type,
    address target,
    uint weight,
    uint weightedValue,
    uint timestamp
  );
  event VoteRemoved(uint tokenId, uint _type, uint newValue, address target);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(address controller_, address _ve) external initializer {
    __Controllable_init(controller_);
    _requireInterface(_ve, InterfaceIds.I_VE_TETU);
    ve = _ve;
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Array of votes. Safe to return the whole array until we have MAX_VOTES restriction.
  function veVotes(uint veId) external view returns (Vote[] memory) {
    return votes[veId];
  }

  /// @dev Length of votes array for given id
  function veVotesLength(uint veId) external view override returns (uint) {
    return votes[veId].length;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_PLATFORM_VOTER || super.supportsInterface(interfaceId);
  }

  function isVotesExist(uint veId) external view override returns (bool) {
    return votes[veId].length > 0;
  }

  // *************************************************************
  //                        VOTES
  // *************************************************************

  /// @dev Resubmit exist votes for given token.
  ///      Need to call it for ve that did not renew votes too long.
  ///      Anyone can renew the votes, no restriction.
  function poke(uint tokenId) external {
    Vote[] memory _votes = votes[tokenId];
    for (uint i; i < _votes.length; ++i) {
      Vote memory v = _votes[i];
      _vote(tokenId, v._type, v.weightedValue / v.weight, v.target, true);
    }
  }

  /// @dev Vote for multiple attributes in one call.
  function voteBatch(
    uint tokenId,
    AttributeType[] memory types,
    uint[] memory values,
    address[] memory targets
  ) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, tokenId), "!owner");
    for (uint i; i < types.length; ++i) {
      _vote(tokenId, types[i], values[i], targets[i], false);
    }
  }

  /// @dev Vote for given parameter using a vote power of given tokenId. Reset previous vote.
  function vote(uint tokenId, AttributeType _type, uint value, address target) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, tokenId), "!owner");
    _vote(tokenId, _type, value, target, false);
  }

  function _vote(uint tokenId, AttributeType _type, uint value, address target, bool onlyRefresh) internal {
    require(value <= RATIO_DENOMINATOR, "!value");

    // load maps for reduce gas usage
    mapping(address => uint) storage _attributeWeights = attributeWeights[_type];
    mapping(address => uint) storage _attributeValues = attributeValues[_type];
    Vote[] storage _votes = votes[tokenId];

    uint totalAttributeWeight;
    uint totalAttributeValue;
    // get new values for ve
    uint veWeight = IVeTetu(ve).balanceOfNFT(tokenId);
    uint veWeightedValue = veWeight * value;

    Vote memory oldVote;
    //remove votes optimised
    {
      bool found;
      uint length = _votes.length;
      if (length != 0) {
        uint i;
        for (; i < length; ++i) {
          Vote memory v = _votes[i];
          if (v._type == _type && v.target == target) {
            require(onlyRefresh || v.timestamp + VOTE_DELAY < block.timestamp, "delay");
            oldVote = v;
            found = true;
            break;
          }
        }
        if (found) {
          if (i != length - 1) {
            _votes[i] = _votes[length - 1];
          }
          _votes.pop();
        } else {
          // it is a new type of vote
          // need to check MAX votes in this case
          require(length < MAX_VOTES, "max");
        }
      }

      totalAttributeWeight = _attributeWeights[target] - oldVote.weight;
      totalAttributeValue = _attributeValues[target] - oldVote.weightedValue;

      // if veWeight is 0, it means that we just remove vote
      if (veWeight == 0 && found) {
        emit VoteReset(
          tokenId,
          uint(_type),
          target,
          oldVote.weight,
          oldVote.weightedValue,
          oldVote.timestamp
        );
      }
    }


    if (veWeight != 0) {

      // add ve values to total values
      totalAttributeWeight += veWeight;
      totalAttributeValue += veWeightedValue;

      // store new total values
      _attributeWeights[target] = totalAttributeWeight;
      _attributeValues[target] = totalAttributeValue;

      // set new attribute value
      _setAttribute(_type, totalAttributeValue / totalAttributeWeight, target);

      // do not override timestamp if we poke an old vote
      _votes.push(
        Vote(
          _type,
          target,
          veWeight,
          veWeightedValue,
          (onlyRefresh && oldVote.timestamp != 0) ? oldVote.timestamp : block.timestamp
        ));

      emit Voted(
        tokenId,
        uint(_type),
        value,
        target,
        veWeight,
        veWeightedValue,
        totalAttributeWeight,
        totalAttributeValue,
        totalAttributeValue / totalAttributeWeight
      );
    }
  }

  /// @dev Change attribute value for given type.
  function _setAttribute(AttributeType _type, uint newValue, address target) internal {
    if (_type == AttributeType.INVEST_FUND_RATIO) {
      require(target == address(0), "!target");
      IForwarder(IController(controller()).forwarder()).setInvestFundRatio(newValue);
    } else if (_type == AttributeType.GAUGE_RATIO) {
      require(target == address(0), "!target");
      IForwarder(IController(controller()).forwarder()).setGaugesRatio(newValue);
    } else if (_type == AttributeType.STRATEGY_COMPOUND) {
      // if for some reason the contract is unable to call this function we should not revert for keep poke support
      try IStrategyV2(target).setCompoundRatio(newValue) {} catch {}
    } else {
      revert("!type");
    }
    emit AttributeChanged(uint(_type), newValue);
  }

  /// @dev Remove all votes for given tokenId.
  function reset(uint tokenId, uint[] memory types, address[] memory targets) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, tokenId) || msg.sender == ve, "!owner");

    Vote[] storage _votes = votes[tokenId];
    uint length = _votes.length;
    for (uint i = length; i > 0; --i) {

      Vote memory v = _votes[i - 1];
      bool found;
      for (uint j; j < types.length; ++j) {
        uint _type = types[j];
        address target = targets[j];
        if (uint(v._type) == _type && v.target == target) {
          found = true;
          break;
        }
      }

      if (found) {
        require(v.timestamp + VOTE_DELAY < block.timestamp, "delay");
        _removeVote(tokenId, v._type, v.target, v.weight, v.weightedValue);

        if (i != length) {
          _votes[i - 1] = _votes[length - 1];
        }

        _votes.pop();
        length--;

        emit VoteReset(
          tokenId,
          uint(v._type),
          v.target,
          v.weight,
          v.weightedValue,
          v.timestamp
        );
      }
    }
  }

  function _removeVote(uint tokenId, AttributeType _type, address target, uint weight, uint veValue) internal {
    uint totalWeights = attributeWeights[_type][target] - weight;
    uint totalValues = attributeValues[_type][target] - veValue;
    attributeWeights[_type][target] = totalWeights;
    if (veValue != 0) {
      attributeValues[_type][target] = totalValues;
    }
    uint newValue;
    if (totalWeights != 0) {
      newValue = totalValues / totalWeights;
    }
    _setAttribute(_type, newValue, target);
    emit VoteRemoved(tokenId, uint(_type), newValue, target);
  }

  function detachTokenFromAll(uint tokenId, address) external override {
    require(msg.sender == ve, "!ve");

    Vote[] storage _votes = votes[tokenId];
    uint length = _votes.length;
    for (uint i = length; i > 0; --i) {
      Vote memory v = _votes[i - 1];
      _removeVote(tokenId, v._type, v.target, v.weight, v.weightedValue);
      _votes.pop();
    }
  }

  ///////////////////////////////////////////////////////////////
  //               EMERGENCY ACTIONS
  //   If something went wrong governance can fix weights.
  ///////////////////////////////////////////////////////////////

  /// @dev In case if something went wrong with vote calculation governance can remove the vote manually for a user
  ///      If removeWeights is false then it will only remove vote from the list without changing weights.
  ///      This will lead to "staked" weights forever. Use `emergencyAdjustWeights()` to fix it.
  function emergencyResetVote(uint tokenId, uint index, bool removeWeights) external {
    require(msg.sender == IController(controller()).governance(), "!gov");
    Vote[] storage _votes = votes[tokenId];

    Vote memory v = _votes[index];
    if (removeWeights) {
      _removeVote(tokenId, v._type, v.target, v.weight, v.weightedValue);
    }

    _votes[index] = _votes[_votes.length - 1];
    _votes.pop();

    emit VoteReset(
      tokenId,
      uint(v._type),
      v.target,
      v.weight,
      v.weightedValue,
      v.timestamp
    );
  }

  /// @dev Before calling this function need to calculate simulation where all votes removed for all user and check the remaining weights/values.
  ///      The difference should be counted for the new values and passed to this function.
  ///      Do not call this function without properly check that users will able to reset votes!
  ///      If any user has invalid votes need to call `emergencyResetVote()` firstly and simulate full reset for all users.
  function emergencyAdjustWeights(AttributeType _type, address target, uint weights, uint values) external {
    require(msg.sender == IController(controller()).governance(), "!gov");

    attributeWeights[_type][target] = weights;
    attributeValues[_type][target] = values;

    uint newValue = weights == 0 ? 0 : values / weights;
    require(newValue <= RATIO_DENOMINATOR, '!ratio');
    _setAttribute(_type, newValue, target);
  }

}
