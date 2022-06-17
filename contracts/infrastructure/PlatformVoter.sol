// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";
import "../interfaces/IForwarder.sol";
import "../interfaces/IPlatformVoter.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IStrategyV2.sol";
import "../proxy/ControllableV3.sol";

/// @title Ve holders can vote for platform attributes values.
/// @author belbix
contract PlatformVoter is ControllableV3, IPlatformVoter {

  enum AttributeType {
    UNKNOWN,
    INVEST_FUND_RATIO,
    GAUGE_RATIO,
    STRATEGY_COMPOUND
  }

  struct Vote {
    AttributeType _type;
    address target;
  }

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VE_VERSION = "1.0.0";
  /// @dev Denominator for different ratios. It is default for the whole platform.
  uint public constant RATIO_DENOMINATOR = 100_000;
  /// @dev Delay between votes.
  uint public constant VOTE_DELAY = 1 weeks;

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
  /// @dev veId => Attribute => Target(zero for not-strategy) => Last vote timestamp
  mapping(uint => mapping(AttributeType => mapping(address => uint))) public lastVote;
  /// @dev Attribute => Target(zero for not-strategy) => sum of votes
  mapping(AttributeType => mapping(address => uint)) public attributeWeights;
  /// @dev Attribute => Target(zero for not-strategy) => sum of nft power multiple on values
  mapping(AttributeType => mapping(address => uint)) public attributeValues;
  /// @dev veId => Attribute => Target(zero for not-strategy) => nft power
  mapping(uint => mapping(AttributeType => mapping(address => uint))) public veWeights;
  /// @dev veId => Attribute => Target(zero for not-strategy) => nft power multiple on value
  mapping(uint => mapping(AttributeType => mapping(address => uint))) public veValues;


  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event AttributeChanged(uint _type, uint value);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(address controller_, address _ve) external initializer {
    __Controllable_init(controller_);
    ve = _ve;
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  // *************************************************************
  //                        VOTES
  // *************************************************************

  /// @dev Vote for given parameter using a vote power of given tokenId. Reset previous votes.
  function vote(uint tokenId, AttributeType _type, uint value, address target) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, tokenId), "!owner");
    require(value <= RATIO_DENOMINATOR, "!value");

    // load maps for reduce gas usage
    mapping(address => uint) storage _lastVote = lastVote[tokenId][_type];
    mapping(address => uint) storage _veWeights = veWeights[tokenId][_type];
    mapping(address => uint) storage _veValues = veValues[tokenId][_type];
    mapping(address => uint) storage _attributeWeights = attributeWeights[_type];
    mapping(address => uint) storage _attributeValues = attributeValues[_type];
    Vote[] storage _votes = votes[tokenId];

    // check delay and renew counter
    require(_lastVote[target] + VOTE_DELAY < block.timestamp, "delay");
    _lastVote[target] = block.timestamp;

    uint totalAttributeWeight;
    uint totalAttributeValue;

    //remove votes optimised
    {
      uint oldVeWeight = _veWeights[target];
      uint oldVeValue = _veValues[target];

      totalAttributeWeight = _attributeWeights[target] - oldVeWeight;
      totalAttributeValue = _attributeValues[target] - oldVeValue;

      if (oldVeValue != 0 || oldVeWeight != 0) {
        uint length = _votes.length;
        if (length != 0) {
          uint i;
          for (; i < length; ++i) {
            Vote memory v = _votes[i];
            if (v._type == _type && v.target == target) {
              break;
            }
          }
          if (i != 0) {
            _votes[i] = _votes[length - 1];
          }
          _votes.pop();
        }
      }
    }


    // get new values for ve
    uint veWeight = IVeTetu(ve).balanceOfNFT(tokenId);
    uint veWeightedValue = veWeight * value;

    if (veWeight != 0 && veWeightedValue != 0) {
      // store new ve values
      _veWeights[target] = veWeight;
      _veValues[target] = veWeightedValue;

      // add ve values to total values
      totalAttributeWeight += veWeight;
      totalAttributeValue += veWeightedValue;

      // store new total values
      _attributeWeights[target] = totalAttributeWeight;
      _attributeValues[target] = totalAttributeValue;

      // set new attribute value
      _setAttribute(_type, totalAttributeValue / totalAttributeWeight, target);

      // write attachments
      IVeTetu(ve).voting(tokenId);
      _votes.push(Vote(_type, target));
    }
  }

  /// @dev Change attribute value for given type.
  function _setAttribute(AttributeType _type, uint newValue, address target) internal {
    if (_type == AttributeType.INVEST_FUND_RATIO) {
      require(target == address(0), "!target");
      require(newValue <= RATIO_DENOMINATOR, "!new_value");
      IForwarder(IController(controller()).forwarder()).setInvestFundRatio(newValue);
    } else if (_type == AttributeType.GAUGE_RATIO) {
      require(target == address(0), "!target");
      require(newValue <= RATIO_DENOMINATOR, "!new_value");
      IForwarder(IController(controller()).forwarder()).setGaugesRatio(newValue);
    } else if (_type == AttributeType.STRATEGY_COMPOUND) {
      require(newValue <= RATIO_DENOMINATOR, "!new_value");
      IStrategyV2(target).setCompoundRatio(newValue);
    } else {
      revert("!type");
    }
    emit AttributeChanged(uint(_type), newValue);
  }

  /// @dev Remove all votes for given tokenId.
  function reset(uint tokenId, uint[] memory ids) external {
    require(IVeTetu(ve).isApprovedOrOwner(msg.sender, tokenId) || msg.sender == ve, "!owner");
    _reset(tokenId, ids);
  }

  function _reset(uint tokenId, uint[] memory ids) internal {
    // need to copy to memory, we will change this array in the loop
    Vote[] memory _votes = votes[tokenId];
    for (uint i; i < ids.length; ++i) {
      uint index = ids[i];
      Vote memory v = _votes[index];
      _removeVote(tokenId, v._type, v.target);
    }
    IVeTetu(ve).abstain(tokenId);
  }

  function _removeVote(uint tokenId, AttributeType _type, address target) internal {
    uint oldVeWeight = veWeights[tokenId][_type][target];
    uint oldVeValue = veValues[tokenId][_type][target];

    attributeWeights[_type][target] -= oldVeWeight;
    attributeValues[_type][target] -= oldVeValue;

    Vote[] storage _votes = votes[tokenId];

    uint length = _votes.length;
    if (length != 0) {
      uint i;
      for (; i < length; ++i) {
        Vote memory v = _votes[i];
        if (v._type == _type && v.target == target) {
          break;
        }
      }
      if (i != 0) {
        _votes[i] = _votes[length - 1];
      }
      _votes.pop();
    }

  }

  function detachTokenFromAll(uint tokenId, address owner) external override {
    Vote[] storage _votes = votes[tokenId];
    uint length = _votes.length;
    for (uint i = 0; i < length; ++i) {
      _removeVote();
    }
  }

}
