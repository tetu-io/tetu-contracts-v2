// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IController {

  function dungeonImplementationsBosses(uint level) external view returns (address);

  function governance() external view returns (address);

  function statController() external view returns (address);

  function chamberController() external view returns (address);

  function oracle() external view returns (address);

  function treasury() external view returns (address);

  function fightCalculator() external view returns (address);

  function dungeonFactory() external view returns (address);

  function fightDelay() external view returns (uint);

  function dungeonMultiplierByLevel(uint level) external view returns (uint);

  function validHeroes(address hero) external view returns (bool);

  function validDungeons(address dungeon) external view returns (bool);

  function validItems(address item) external view returns (bool);

  function heroes(uint id) external view returns (address);

  function dungeons(uint id) external view returns (address);

  function items(uint id) external view returns (address);

  function heroesLength() external view returns (uint);

  function dungeonsLength() external view returns (uint);

  function itemsLength() external view returns (uint);

  function dungeonImplementationsByLevel(uint level, uint index) external view returns (address);

  function dungeonImplementationsLength(uint level) external view returns (uint);

  function minLevelForTreasury(address token) external view returns (uint);

  function registerDungeon(address dungeon_) external;

}
