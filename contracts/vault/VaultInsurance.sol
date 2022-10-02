// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ERC165.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IVaultInsurance.sol";

/// @title Simple dedicated contract for store vault fees
/// @author belbix
contract VaultInsurance is ERC165, IVaultInsurance  {
  using SafeERC20 for IERC20;

  /// @dev Vault address
  address public override vault;
  /// @dev Vault underlying asset
  address public override asset;

  /// @dev Init contract with given attributes.
  ///      Should be called from factory during creation process.
  function init(address _vault, address _asset) external override {
    require(vault == address(0) && asset == address(0), "INITED");
    vault = _vault;
    asset = _asset;
  }

  /// @dev Transfer tokens to vault in case of covering need.
  function transferToVault(uint amount) external override {
    require(msg.sender == vault, "!VAULT");
    IERC20(asset).safeTransfer(msg.sender, amount);
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IVaultInsurance).interfaceId || super.supportsInterface(interfaceId);
  }

}
