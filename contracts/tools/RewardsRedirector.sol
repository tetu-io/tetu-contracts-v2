// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../interfaces/IGauge.sol";
import "../openzeppelin/EnumerableSet.sol";

contract RewardsRedirector {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  string public constant VERSION = "1.0.0";

  address public owner;
  address public pendingOwner;
  address public gauge;
  EnumerableSet.AddressSet internal operators;
  EnumerableSet.AddressSet internal redirected;
  mapping(address => address[]) public redirectedVaults;

  constructor(address _owner, address _gauge) {
    owner = _owner;
    gauge = _gauge;
    operators.add(_owner);
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "!owner");
    _;
  }

  modifier onlyOperator() {
    require(operators.contains(msg.sender), "!operator");
    _;
  }

  /////////////////// VIEWS ////////////////////

  function getOperators() external view returns (address[] memory) {
    return operators.values();
  }

  function getRedirected() external view returns (address[] memory) {
    return redirected.values();
  }

  function getRedirectedVaults(address adr) external view returns (address[] memory) {
    return redirectedVaults[adr];
  }

  /////////////////// GOV ////////////////////

  function offerOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "zero");
    pendingOwner = newOwner;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingOwner, "!owner");
    owner = pendingOwner;
  }

  function changeOperator(address adr, bool status) external onlyOwner {
    if (status) {
      operators.add(adr);
    } else {
      operators.remove(adr);
    }
  }

  function changeRedirected(address adr, address[] calldata vaults, bool status) external onlyOwner {
    if (status) {
      redirected.add(adr);
      redirectedVaults[adr] = vaults;
    } else {
      redirected.remove(adr);
      delete redirectedVaults[adr];
    }
  }

  /////////////////// MAIN LOGIC ////////////////////

  function claimRewards() external onlyOperator {
    address _gauge = gauge;
    address[] memory _redirected = redirected.values();
    for (uint j; j < _redirected.length; ++j) {
      address[] memory _vaults = redirectedVaults[_redirected[j]];
      for (uint i; i < _vaults.length; ++i) {
        IGauge(_gauge).getAllRewards(_vaults[i], _redirected[j]);
      }
    }
  }

  function withdraw(address token) external onlyOperator {
    IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
  }

}
