// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface ITetuVaultV2 {

  function setSplitter(address _splitter) external;

  function coverLoss(uint amount) external;

}
