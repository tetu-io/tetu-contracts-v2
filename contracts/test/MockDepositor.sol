// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../strategy/DepositorBase.sol";
import "./IMockToken.sol";
import "../openzeppelin/Initializable.sol";

/// @title Mock contract for base Depositor.
/// @author bogdoslav
contract MockDepositor is DepositorBase, Initializable {

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant DEPOSITOR_MOCK_VERSION = "1.0.0";

  uint8[] private _depositorWeights;

  address[] private _depositorAssets;
  uint[] private _depositorAmounts;

  address[] private _depositorRewardTokens;
  uint[] private _depositorRewardAmounts;

  // @notice tokens must be MockTokens
  function __MockDepositor_init(
    address[] memory tokens_,
    address[] memory rewardTokens_,
    uint[] memory rewardAmounts_
  ) internal onlyInitializing {
    require(rewardTokens_.length == rewardAmounts_.length);
    uint tokensLength = tokens_.length;
    for (uint i = 0; i < tokensLength; ++i) {
      _depositorAssets.push(tokens_[i]);
      _depositorAmounts.push(0);
    }
    for (uint i = 0; i < rewardTokens_.length; ++i) {
      _depositorRewardTokens.push(rewardTokens_[i]);
      _depositorRewardAmounts.push(rewardAmounts_[i]);
    }

    // proportional weights for now
    _depositorWeights = new uint8[](tokensLength);
    uint weight = 100 / tokensLength;
    for (uint i = 0; i < tokensLength; ++i) {
      _depositorWeights[i] = uint8(weight);
    }
  }

  /// @dev Returns pool assets
  function _depositorPoolAssets() override public virtual view
  returns (address[] memory) {
    return _depositorAssets;
  }

  /// @dev Returns pool weights in percents
  function _depositorPoolWeights() override public virtual view
  returns (uint8[] memory) {
    return _depositorWeights;
  }

  /// @dev Returns depositor's pool shares / lp token amount
  function _depositorLiquidity() override public virtual view returns (uint) {
    return _depositorAmounts[0];
  }

  function _minValue(uint[] memory values_) private pure returns (uint min) {
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
    require(_depositorAssets.length == amountsDesired_.length);

    uint len = amountsDesired_.length;
    uint minAmount = _minValue(amountsDesired_);
    amountsConsumed = new uint[](len);

    for (uint i = 0; i < len; ++i) {
      IMockToken token = IMockToken(_depositorAssets[i]);
      token.burn(address(this), minAmount);
      amountsConsumed[i] = minAmount;
    }

    liquidityOut = minAmount;
  }

  /// @dev Withdraw given lp amount from the pool.
  /// @notice if requested liquidityAmount >= invested, then should make full exit
  function _depositorExit(uint liquidityAmount) override internal virtual returns (uint[] memory amountsOut) {

    uint depositorLiquidity = _depositorLiquidity();
    if (liquidityAmount > depositorLiquidity) {
      liquidityAmount = depositorLiquidity;
    }

    uint len = _depositorAssets.length;
    amountsOut = new uint[](len);

    for (uint i = 0; i < len; ++i) {
      IMockToken token = IMockToken(_depositorAssets[i]);
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
