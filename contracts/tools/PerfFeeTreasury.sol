// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";

contract PerfFeeTreasury {
  using SafeERC20 for IERC20;

  address public governance;
  address public pendingGovernance;

  constructor(address _governance) {
    governance = _governance;
  }

  modifier onlyGovernance() {
    require(msg.sender == governance, "NOT_GOV");
    _;
  }

  function offerOwnership(address newOwner) external onlyGovernance {
    require(newOwner != address(0), "ZERO_ADDRESS");
    pendingGovernance = newOwner;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingGovernance, "NOT_GOV");
    governance = pendingGovernance;
  }

  function claim(address[] memory tokens) external onlyGovernance {
    address _governance = governance;
    for (uint i = 0; i < tokens.length; ++i) {
      IERC20(tokens[i]).safeTransfer(_governance, IERC20(tokens[i]).balanceOf(address(this)));
    }
  }

}
