// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

/// @title Abstract contract for base Depositor.
/// All communication with external pools should be done at inherited contract
/// @author bogdoslav
abstract contract DepositorBase {

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant DEPOSITOR_BASE_VERSION = "1.0.0";

  /// @dev Returns pool assets
  function _depositorPoolAssets() public virtual view returns (address[] memory assets);
  /*
  /// @dev Returns pool assets
  function _depositorPoolWeights() public virtual view returns (uint8[] memory weights);
  */
  /// @dev Returns depositor's pool shares / lp token amount
  function _depositorLiquidity() public virtual view returns (uint);

  /// @dev Returns lp token total supply
  function _depositorTotalSupply() public virtual view returns (uint);

  /// @dev Deposit given amount to the pool.
  function _depositorEnter(uint[] memory amountsDesired_) internal virtual
  returns (uint[] memory amountsConsumed, uint liquidityOut);

  /// @dev Withdraw given lp amount from the pool.
  function _depositorExit(uint liquidityAmount) internal virtual returns (uint[] memory amountsOut);

  /// @dev If pool supports emergency withdraw need to call it for emergencyExit()
  function _depositorEmergencyExit() internal virtual returns (uint[] memory amountsOut) {
    return _depositorExit(_depositorLiquidity());
  }

  /// @dev Claim all possible rewards.
  function _depositorClaimRewards() internal virtual
  returns (address[] memory rewardTokens, uint[] memory rewardAmounts);

}
