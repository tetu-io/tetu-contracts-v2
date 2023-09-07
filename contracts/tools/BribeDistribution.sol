// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IERC20.sol";
import "../interfaces/IBribe.sol";

contract BribeDistribution {

  string public constant VERSION = "1.0.0";

  address public owner;
  address public pendingOwner;
  address public operator;

  IBribe public immutable bribe;
  address public immutable vault;
  address public immutable token;
  uint public round;

  constructor(address bribe_, address _vault, address _token) {
    bribe = IBribe(bribe_);
    vault = _vault;
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

    uint toBribes = IERC20(token).balanceOf(address(this));
    require(toBribes != 0, "ZERO_BALANCE");

    // assume we will have bribes once per 2 weeks. Need to use a half of the current balance in case of start of new 2 weeks epoch.
    if (fresh) {
      toBribes = toBribes / 2;
    }

    _approveIfNeed(token, address(bribe), toBribes);
    bribe.notifyForNextEpoch(vault, token, toBribes);
  }

  function _approveIfNeed(address _token, address dst, uint amount) internal {
    if (IERC20(_token).allowance(address(this), dst) < amount) {
      IERC20(_token).approve(dst, type(uint).max);
    }
  }

}
