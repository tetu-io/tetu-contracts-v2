// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IERC20.sol";
import "../interfaces/IVeDistributor.sol";

contract BribeDistribution {

  string public constant VERSION = "1.0.0";

  address public owner;
  address public pendingOwner;
  address public operator;

  IVeDistributor public immutable veDist;
  address public immutable token;
  uint public round;

  constructor(address veDist_, address _token) {
    veDist = IVeDistributor(veDist_);
    token = _token;
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "NOT_OWNER");
    _;
  }

  modifier onlyOperator() {
    require(msg.sender == operator || msg.sender == owner, "NOT_OPERATOR");
    _;
  }

  function offerOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "ZERO_ADDRESS");
    pendingOwner = newOwner;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingOwner, "NOT_OWNER");
    owner = pendingOwner;
  }

  function setOperator(address operator_) external onlyOwner {
    operator = operator_;
  }

  ////////////////// MAIN LOGIC //////////////////////

  function autoNotify() external onlyOperator {
    _notify(IERC20(token).balanceOf(msg.sender), round % 2 == 0);
    round++;
  }

  function manualNotify(uint amount, bool fresh) external onlyOperator {
    _notify(amount, fresh);
  }

  function _notify(uint amount, bool fresh) internal {
    if (amount != 0) {
      IERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    uint toRewards = IERC20(token).balanceOf(address(this));
    require(toRewards != 0, "ZERO_BALANCE");

    // assume we will have bribes once per 2 weeks. Need to use a half of the current balance in case of start of new 2 weeks epoch.
    if (fresh) {
      toRewards = toRewards / 2;
    }

    IVeDistributor _veDist = veDist;

    IERC20(token).transfer(address(_veDist), toRewards);
    _veDist.checkpoint();
    _veDist.checkpointTotalSupply();
  }

}
