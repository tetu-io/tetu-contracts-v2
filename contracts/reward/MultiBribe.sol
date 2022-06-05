// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./StakelessMultiPoolBase.sol";
import "../proxy/ControllableV3.sol";
import "../interfaces/IVoter.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IBribe.sol";


contract MultiBribe is StakelessMultiPoolBase, ControllableV3, IBribe {

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant MULTI_BRIBE_VERSION = "1.0.0";

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev The ve token used for gauges
  address public ve;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event BribeDeposit(address indexed vault, uint indexed veId, uint amount);
  event BribeWithdraw(address indexed vault, uint indexed veId, uint amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  function init(
    address controller_,
    address _operator,
    address _ve,
    address _defaultReward
  ) external initializer {
    __Controllable_init(controller_);
    __MultiPool_init(_operator, _defaultReward);
    ve = _ve;
  }

  function voter() public view returns (address) {
    return IController(controller()).voter();
  }

  // *************************************************************
  //                        CLAIMS
  // *************************************************************

  function getReward(
    address _vault,
    uint veId,
    address[] memory tokens
  ) external override {
    _getReward(_vault, veId, tokens, IERC721(ve).ownerOf(veId));
  }

  function getAllRewards(
    address _vault,
    uint veId
  ) external override {
    _getAllRewards(_vault, veId, IERC721(ve).ownerOf(veId));
  }

  function _getAllRewards(
    address _vault,
    uint veId,
    address recipient
  ) internal {
    address[] storage rts = rewardTokens[_vault];
    uint length = rts.length;
    address[] memory tokens = new address[](length + 1);
    for (uint i; i < length; ++i) {
      tokens[i] = rts[i];
    }
    tokens[length] = defaultRewardToken;
    _getReward(_vault, veId, tokens, recipient);
  }

  function getAllRewardsForTokens(
    address[] memory _vaults,
    uint veId
  ) external override {
    address recipient = IERC721(ve).ownerOf(veId);
    for (uint i; i < _vaults.length; i++) {
      _getAllRewards(_vaults[i], veId, recipient);
    }
  }

  function _getReward(
    address _vault,
    uint veId,
    address[] memory _rewardTokens,
    address recipient
  ) internal {
    _getReward(_vault, tokenIdToAddress(veId), _rewardTokens, recipient);
  }

  // *************************************************************
  //                   DEPOSIT/WITHDRAW
  // *************************************************************

  /// @dev Only voter can call it when a user vote for the vault
  function deposit(address vault, uint amount, uint veId) external override {
    require(msg.sender == voter(), "Not voter");
    _registerBalanceIncreasing(vault, tokenIdToAddress(veId), amount);
    emit BribeDeposit(vault, veId, amount);
  }

  /// @dev Only voter can call it when a user reset the vote for the vault.
  function withdraw(address vault, uint amount, uint veId) external override {
    require(msg.sender == voter(), "Not voter");
    _registerBalanceDecreasing(vault, tokenIdToAddress(veId), amount);
    emit BribeWithdraw(vault, veId, amount);
  }

  // *************************************************************
  //                   REWARDS DISTRIBUTION
  // *************************************************************

  function notifyRewardAmount(address vault, address token, uint amount) external override {
    _notifyRewardAmount(vault, token, amount);
  }

  // *************************************************************
  //                   INTERNAL LOGIC
  // *************************************************************

  function isStakeToken(address token) public view override returns (bool) {
    return IController(controller()).isValidVault(token);
  }

  function addressToTokenId(address adr) public pure returns (uint) {
    return uint(uint160(adr));
  }

  function tokenIdToAddress(uint tokenId) public pure returns (address) {
    address adr = address(uint160(tokenId));
    require(addressToTokenId(adr) == tokenId, "Wrong convert");
    return adr;
  }

}
