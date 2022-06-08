// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/IVeDistributor.sol";
import "../interfaces/IERC20.sol";


contract MockDistributor {

  function multipleNotify(address veDist, address token, uint amount) external {
    IERC20(token).approve(veDist, type(uint).max);
    IVeDistributor(veDist).notifyReward(amount);
    IVeDistributor(veDist).notifyReward(amount);
  }

  function notifyAndClaim(address veDist, address token, uint amount, uint veID) external {
    IERC20(token).approve(veDist, type(uint).max);
    IVeDistributor(veDist).notifyReward(amount);
    IVeDistributor(veDist).claim(veID);
  }

}
