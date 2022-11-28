// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./IVaultInsurance.sol";
import "./IERC20.sol";

interface ITetuVaultV2 {

  function init(
    address controller_,
    IERC20 _asset,
    string memory _name,
    string memory _symbol,
    address _gauge,
    uint _buffer
  ) external;

  function setSplitter(address _splitter) external;

  function coverLoss(uint amount) external;

  function initInsurance(IVaultInsurance _insurance) external;

  function gauge() external returns (address);

}
