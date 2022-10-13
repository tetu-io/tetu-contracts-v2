// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../strategy/DepositorBase.sol";
import "./IMockToken.sol";

/// @title Mock contract for base Depositor.
/// @author bogdoslav
contract MockDepositor is DepositorBase {

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant DEPOSITOR_MOCK_VERSION = "1.0.0";

  address[] private _depositorTokens;
  uint[] private _depositorAmounts;

  address[] private _depositorRewardTokens;
  uint[] private _depositorRewardAmounts;

  // @dev tokens must be MockTokens
  constructor(address[] memory tokens_, address[] memory rewardTokens_, uint[] memory rewardAmounts_) {
    require(rewardTokens_.length == rewardAmounts_.length);

    for (uint i = 0; i < tokens_.length; ++i) {
      _depositorTokens.push(tokens_[i]);
      _depositorAmounts.push(0);
    }
    for (uint i = 0; i < rewardTokens_.length; ++i) {
      _depositorRewardTokens.push(rewardTokens_[i]);
      _depositorRewardAmounts.push(rewardAmounts_[i]);
    }
  }

  /// @dev Returns pool assets
  function _depositorPoolTokens() override public virtual view
  returns (address[] memory) {
    return _depositorTokens;
  }

  /*
  /// @dev Returns pool assets weights
  function _depositorPoolWeights() public virtual view returns (uint8[] memory weights);
  */

  /// @dev Returns lp token total supply
  function _depositorTotalSupply() override public virtual view returns (uint) {
    return _depositorAmounts[0];
  }

  /// @dev Returns depositor's pool shares / lp token amount
  function _depositorLiquidity() override public virtual view returns (uint) {
    return _depositorAmounts[0];
  }

  function _minValue(uint[] memory values_) private returns (uint min) {
    min = values_[0];
    uint len = values_.length;

    for (uint i = 1; i < len; ++i) {
      uint val = values_[i];
      if (val < min) min = val;
    }
  }

  /// @dev Deposit given amount to the pool.
  function _depositorEnter(uint[] memory amountsDesired_) override internal virtual
  returns (uint[] memory amountsConsumed, uint liquidityOut) {
    require(_depositorTokens.length == amountsDesired_.length);

    uint len = amountsDesired_.length;
    uint minAmount = _minValue(amountsDesired_);
    amountsConsumed = new uint[](len);

    for (uint i = 0; i < len; ++i) {
      IMockToken token = IMockToken(_depositorTokens[i]);
      token.burn(address(this), minAmount);
      amountsConsumed[i] = minAmount;
    }

    liquidityOut = minAmount;
  }

  /// @dev Withdraw given lp amount from the pool.
  function _depositorExit(uint liquidityAmount) override internal virtual returns (uint[] memory amountsOut) {
    require(liquidityAmount <= _depositorLiquidity());
    uint len = _depositorTokens.length;
    amountsOut = new uint[](len);

    for (uint i = 0; i < len; ++i) {
      IMockToken token = IMockToken(_depositorTokens[i]);
      token.mint(address(this), liquidityAmount);
      amountsOut[i] = liquidityAmount;
    }
  }

  /// @dev Claim all possible rewards.
  function _depositorClaimRewards() override internal virtual
  returns (address[] memory rewardTokens, uint[] memory rewardAmounts) {
    uint len = _depositorRewardTokens.length;
    for (uint i = 0; i < len; ++i) {
      IMockToken token = IMockToken(_depositorRewardTokens[i]);
      uint amount = _depositorRewardAmounts[i];
      token.mint(address(this), amount);
    }
    return (_depositorRewardTokens, _depositorRewardAmounts);
  }

}
