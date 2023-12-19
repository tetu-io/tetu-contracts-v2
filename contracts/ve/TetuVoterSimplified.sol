// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../openzeppelin/EnumerableSet.sol";
import "../interfaces/IVeTetu.sol";
import "../interfaces/IVoter.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IGauge.sol";
import "../interfaces/IBribe.sol";
import "../interfaces/IMultiPool.sol";
import "../proxy/ControllableV3.sol";
import "../interfaces/ITetuLiquidator.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IERC4626.sol";

/// @title Voter for veTETU.
///        Based on Solidly contract.
/// @author belbix
contract TetuVoterSimplified is ReentrancyGuard, ControllableV3, IVoter {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VOTER_VERSION = "1.0.0";
  /// @dev Rewards are released over 7 days
  uint internal constant _DURATION = 7 days;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  address public token;
  address public gauge;

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

  event NotifyReward(address indexed sender, uint amount);
  event DistributeReward(address indexed sender, address indexed vault, uint amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  function init(
    address _controller,
    address _rewardToken,
    address _gauge
  ) external initializer {
    __Controllable_init(_controller);

    _requireERC20(_rewardToken);
    _requireInterface(_gauge, InterfaceIds.I_GAUGE);

    token = _rewardToken;
    gauge = _gauge;

    // if the gauge will be changed in a new implementation, need to revoke approval and set a new
    IERC20(_rewardToken).safeApprove(gauge, type(uint).max);
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  function ve() external pure override returns (address) {
    return address(0);
  }

  /// @dev Returns true for valid vault registered in controller.
  function isVault(address _vault) public view returns (bool) {
    return IController(controller()).isValidVault(_vault);
  }

  /// @dev Returns register in controller vault by id .
  function validVaults(uint id) public view returns (address) {
    return IController(controller()).vaults(id);
  }

  /// @dev Valid vaults registered in controller length.
  function validVaultsLength() public view returns (uint) {
    return IController(controller()).vaultsListLength();
  }


  function votedVaultsLength(uint /*veId*/) external pure override returns (uint) {
    // noop
    return 0;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_VOTER || super.supportsInterface(interfaceId);
  }

  function isVotesExist(uint /*veId*/) external pure override returns (bool) {
    // noop
    return false;
  }

  // *************************************************************
  //                        ATTACH/DETACH
  // *************************************************************

  function attachTokenToGauge(address /*stakingToken*/, uint /*tokenId*/, address /*account*/) external pure override {
    // noop
  }

  function detachTokenFromGauge(address /*stakingToken*/, uint /*tokenId*/, address /*account*/) external pure override {
    // noop
  }

  function detachTokenFromAll(uint /*tokenId*/, address /*account*/) external pure override {
    // noop
  }

  // *************************************************************
  //                        REWARDS
  // *************************************************************

  /// @dev Add rewards to this contract. It will be distributed to gauges.
  function notifyRewardAmount(uint amount) external override {
    require(amount != 0, "zero amount");

    IController c = IController(controller());
    address _token = token;
    address _gauge = gauge;

    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    emit NotifyReward(msg.sender, amount);

    // gauge is able to revert if reward amount is too small
    // in this case let's rollback transferring rewards to all vaults,
    // and keep rewards on balance up to the next attempt
    try TetuVoterSimplified(address(this))._notifyRewardAmount(c, _token, _gauge, amount) {} catch {}
  }

  /// @notice Try to send all available rewards to vaults
  /// @dev We need this external function to be able to call it inside try/catch
  ///      and revert transferring of rewards to all vaults simultaneously if transferring to any vault reverts
  function _notifyRewardAmount(IController c, address _token, address _gauge, uint amount) external {
    // any sender is allowed, no limitations
    ITetuLiquidator liquidator = ITetuLiquidator(c.liquidator());

    amount = IERC20(_token).balanceOf(address(this));

    uint length = c.vaultsListLength();

    address[] memory _vaults = new address[](length);
    uint[] memory tvlInTokenValues = new uint[](length);
    uint tvlSum;

    for (uint i; i < length; ++i) {
      IERC4626 vault = IERC4626(c.vaults(i));
      _vaults[i] = address(vault);
      uint tvl = vault.totalAssets();
      address asset = vault.asset();

      uint tvlInTokenValue = liquidator.getPrice(asset, _token, tvl);
      tvlInTokenValues[i] = tvlInTokenValue;
      tvlSum += tvlInTokenValue;
    }

    for (uint i; i < length; ++i) {
      uint ratio = tvlInTokenValues[i] * 1e18 / tvlSum;
      uint toDistro = amount * ratio / 1e18;
      if (toDistro != 0 && IERC20(_token).balanceOf(address(this)) >= toDistro) {
        IGauge(_gauge).notifyRewardAmount(_vaults[i], _token, toDistro);
        emit DistributeReward(msg.sender, _vaults[i], toDistro);
      }
    }
  }

  function distribute(address /*_vault*/) external pure override {
    // noop
  }

  function distributeAll() external pure override {
    // noop
  }
}
