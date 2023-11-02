// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IERC20.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IVeDistributor.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/Math.sol";
import "../proxy/ControllableV3.sol";

/// @title Contract for distributing rewards to ve holders.
/// @author belbix
contract VeDistributorV2 is ControllableV3, IVeDistributor {
  using SafeERC20 for IERC20;

  struct EpochInfo {
    uint ts;
    uint rewardsPerToken;
    uint tokenBalance;
    uint veTotalSupply;
  }

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VE_DIST_VERSION = "2.0.0";
  uint internal constant WEEK = 7 * 86400;

  // *************************************************************
  //                        VARIABLES
  //                      Keep ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Voting escrow token address
  IVeTetu public ve;
  /// @dev Token for ve rewards
  address public override rewardToken;

  // --- CHECKPOINT INFO

  uint public epoch;
  /// @dev epoch => EpochInfo
  mapping(uint => EpochInfo) internal _epochInfos;

  uint internal _tokensClaimedSinceLastSnapshot;

  // --- USER INFO

  /// @dev tokenId => paid epoch
  mapping(uint => uint) internal _lastPaidEpoch;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Checkpoint(
    uint epoch,
    uint newEpochTs,
    uint tokenBalance,
    uint prevTokenBalance,
    uint tokenDiff,
    uint rewardsPerToken,
    uint veTotalSupply
  );
  event RewardsClaimed(uint tokenId, address owner, uint amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(
    address controller_,
    address _ve,
    address _rewardToken
  ) external initializer {
    __Controllable_init(controller_);
    _requireERC20(_rewardToken);
    _requireInterface(_ve, InterfaceIds.I_VE_TETU);

    rewardToken = _rewardToken;
    ve = IVeTetu(_ve);
  }

  /// @dev Governance can claim all tokens in emergency case. Assume this will never happen.
  ///      After withdraw this contract will be broken and require redeploy.
  function emergencyWithdraw() external {
    require(isGovernance(msg.sender), "not gov");
    IERC20(rewardToken).safeTransfer(msg.sender, IERC20(rewardToken).balanceOf(address(this)));
  }

  // *************************************************************
  //                      CHECKPOINT
  // *************************************************************

  /// @dev Make checkpoint and start new epoch. Anyone can call it.
  ///      This call can be done from multiple places and must not have reverts.
  function checkpoint() external override {
    uint _epoch = epoch;
    address _rewardToken = rewardToken;
    uint tokenBalance = IERC20(_rewardToken).balanceOf(address(this));

    // do not start new epoch if zero rewards
    if (tokenBalance == 0) {
      return;
    }

    EpochInfo memory epochInfo = _epochInfos[_epoch];
    uint newEpochTs = block.timestamp * WEEK / WEEK;

    // check epoch time only if we already started
    if (_epoch != 0 && epochInfo.ts >= newEpochTs) {
      return;
    }

    uint tokenDiff = tokenBalance + _tokensClaimedSinceLastSnapshot - epochInfo.tokenBalance;
    if (tokenDiff == 0) {
      return;
    }

    IVeTetu _ve = ve;
    uint veTotalSupply = _ve.totalSupplyAtT(newEpochTs);
    // we can use a simple invariant - sum of all balanceOfNFTAt must be equal to totalSupplyAtT
    uint rewardsPerToken = tokenDiff * 1e18 / veTotalSupply;

    // write states
    _tokensClaimedSinceLastSnapshot = 0;
    epoch = _epoch + 1;
    _epochInfos[_epoch + 1] = EpochInfo({
      ts: newEpochTs,
      rewardsPerToken: rewardsPerToken,
      tokenBalance: tokenBalance,
      veTotalSupply: veTotalSupply
    });

    emit Checkpoint(
      _epoch + 1,
      newEpochTs,
      tokenBalance,
      epochInfo.tokenBalance,
      tokenDiff,
      rewardsPerToken,
      veTotalSupply
    );
  }

  /// @dev Deprecated, keep for interface support
  function checkpointTotalSupply() external pure override {
    // noop
  }

  // *************************************************************
  //                      CLAIM
  // *************************************************************

  /// @dev Return available to claim earned amount
  function claimable(uint _tokenId) public view returns (uint rewardsAmount) {
    uint curEpoch = epoch;
    uint lastPaidEpoch = _lastPaidEpoch[_tokenId];

    uint unpaidEpochCount = curEpoch > lastPaidEpoch ? curEpoch - lastPaidEpoch : 0;

    if (unpaidEpochCount == 0) {
      return 0;
    }

    // max depth is 50 epochs (~1 year), early rewards will be lost for this ve
    if (unpaidEpochCount > 50) {
      unpaidEpochCount = 50;
    }

    IVeTetu _ve = ve;

    for (uint i; i < unpaidEpochCount; ++i) {
      EpochInfo storage epochInfo = _epochInfos[lastPaidEpoch + i];
      uint balanceAtEpoch = _ve.balanceOfNFTAt(_tokenId, epochInfo.ts);
      rewardsAmount += balanceAtEpoch * epochInfo.rewardsPerToken / 1e18;
    }

    return rewardsAmount;
  }

  /// @dev Claim rewards for given veID
  function claim(uint _tokenId) public override returns (uint toClaim) {
    toClaim = claimable(_tokenId);

    if (toClaim != 0) {
      address owner = ve.ownerOf(_tokenId);
      require(msg.sender == owner, "not owner");
      IERC20(rewardToken).safeTransfer(owner, toClaim);

      _lastPaidEpoch[_tokenId] = epoch;
      _tokensClaimedSinceLastSnapshot += toClaim;

      emit RewardsClaimed(_tokenId, owner, toClaim);
    }
  }

  /// @dev Claim rewards for given veIDs
  function claimMany(uint[] memory _tokenIds) external returns (bool success) {
    for (uint i = 0; i < _tokenIds.length; i++) {
      claim(_tokenIds[i]);
    }
    return true;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_VE_DISTRIBUTOR || super.supportsInterface(interfaceId);
  }

}
