// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";
import "../interfaces/IERC20.sol";

contract VaultInsurance {
  using SafeERC20 for IERC20;

  address immutable vault;
  IERC20 immutable asset;

  constructor (IERC20 _asset) {
    vault = msg.sender;
    asset = _asset;
  }

  function transferToVault(uint amount) external {
    require(msg.sender == vault, "!VAULT");
    asset.safeTransfer(msg.sender, amount);
  }

}
