// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./interfaces/IERC20.sol";

/// @title Contract for handling TETU from mainnet bridged via Polygon native bridge.
/// @author belbix
contract TetuBridgedProcessing {

  //////////// EVENTS ///////////////

  event OfferAdmin(address newAdmin);
  event AcceptAdmin(address newAdmin);
  event PauseOn();
  event PauseOff();
  event BridgeTetu(address user, uint amount);
  event ClaimTetu(address user, uint amount);

  //////////// VARIABLES ///////////////

  IERC20 public immutable tetu;
  IERC20 public immutable tetuBridged;
  address public admin;
  address public pendingAdmin;
  bool public paused;

  constructor(address _tetu, address _tetuBridged, address _admin) {
    tetu = IERC20(_tetu);
    tetuBridged = IERC20(_tetuBridged);
    admin = _admin;
  }

  //////////// ADMIN ACTIONS ///////////////

  function offerAdmin(address adr) external {
    require(msg.sender == admin, "!admin");
    pendingAdmin = adr;
    emit OfferAdmin(adr);
  }

  function acceptAdmin() external {
    require(msg.sender == pendingAdmin, "!admin");
    admin = msg.sender;
    pendingAdmin = address(0);
    emit AcceptAdmin(msg.sender);
  }

  function pauseOn() external {
    require(msg.sender == admin, "!admin");
    paused = true;
    emit PauseOn();
  }

  function pauseOff() external {
    require(msg.sender == admin, "!admin");
    paused = false;
    emit PauseOff();
  }

  //////////// MAIN ACTIONS ///////////////

  function bridgeTetuToMainnet(uint amount) external {
    require(!paused, "paused");
    tetu.transferFrom(msg.sender, address(this), amount);
    tetuBridged.transfer(msg.sender, amount);
    emit BridgeTetu(msg.sender, amount);
  }

  function claimBridgedTetu(uint amount) external {
    require(!paused, "paused");
    tetuBridged.transferFrom(msg.sender, address(this), amount);
    tetu.transfer(msg.sender, amount);
    emit ClaimTetu(msg.sender, amount);
  }

}
