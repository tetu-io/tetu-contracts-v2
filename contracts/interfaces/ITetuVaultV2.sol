// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./IVaultInsurance.sol";
import "./IERC20.sol";
import "./ISplitter.sol";

interface ITetuVaultV2 {

  function splitter() external view returns (ISplitter);

  function insurance() external view returns (IVaultInsurance);

  function init(
    address controller_,
    IERC20 _asset,
    string memory _name,
    string memory _symbol,
    address _gauge,
    uint _buffer
  ) external;

  function setSplitter(address _splitter) external;

  function initInsurance(IVaultInsurance _insurance) external;

}
