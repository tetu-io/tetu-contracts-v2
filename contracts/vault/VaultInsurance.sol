// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";
import "../interfaces/IERC20.sol";

/// @title Simple dedicated contract for store vault fees
/// @author belbix
contract VaultInsurance {
  using SafeERC20 for IERC20;

  /// @dev Vault address. Assume to be creator of this contract.
  address immutable vault;
  /// @dev Vault underlying asset
  IERC20 immutable asset;

  constructor (IERC20 _asset) {
    vault = msg.sender;
    asset = _asset;
  }

  /// @dev Transfer tokens to vault in case of covering need.
  function transferToVault(uint amount) external {
    require(msg.sender == vault, "!VAULT");
    asset.safeTransfer(msg.sender, amount);
  }

}
