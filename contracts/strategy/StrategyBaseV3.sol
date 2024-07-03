// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../interfaces/IStrategyV3.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IForwarder.sol";
import "../proxy/ControllableV3.sol";
import "./StrategyLib2.sol";

/// @title Abstract contract for base strategy functionality
/// @author a17
abstract contract StrategyBaseV3 is IStrategyV3, ControllableV3 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant STRATEGY_BASE_VERSION = "3.0.1";

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  BaseState internal baseState;

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @notice Initialize contract after setup it as proxy implementation
  function __StrategyBase_init(
    address controller_,
    address splitter_
  ) internal onlyInitializing {
    _requireInterface(splitter_, InterfaceIds.I_SPLITTER);
    __Controllable_init(controller_);
    StrategyLib2.init(baseState, controller_, splitter_);
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Total amount of underlying assets under control of this strategy.
  function totalAssets() public view override returns (uint) {
    return IERC20(baseState.asset).balanceOf(address(this)) + investedAssets();
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_STRATEGY_V3 || interfaceId == InterfaceIds.I_STRATEGY_V2 || super.supportsInterface(interfaceId);
  }

  function asset() external view returns (address) {
    return baseState.asset;
  }

  function splitter() external view returns (address) {
    return baseState.splitter;
  }

  function compoundRatio() external view returns (uint) {
    return baseState.compoundRatio;
  }

  function performanceReceiver() external view returns (address) {
    return baseState.performanceReceiver;
  }

  function performanceFee() external view returns (uint) {
    return baseState.performanceFee;
  }

  function performanceFeeRatio() external view returns (uint) {
    return baseState.performanceFeeRatio;
  }

  function strategySpecificName() external view returns (string memory) {
    return baseState.strategySpecificName;
  }

  // *************************************************************
  //                   VOTER ACTIONS
  // *************************************************************

  /// @dev PlatformVoter can change compound ratio for some strategies.
  ///      A strategy can implement another logic for some uniq cases.
  function setCompoundRatio(uint value) external virtual override {
    StrategyLib2._changeCompoundRatio(baseState, controller(), value);
  }

  // *************************************************************
  //                   OPERATOR ACTIONS
  // *************************************************************

  /// @dev The name will be used for UI.
  function setStrategySpecificName(string calldata name) external {
    StrategyLib2.onlyOperators(controller());
    StrategyLib2._changeStrategySpecificName(baseState, name);
  }

  /// @dev In case of any issue operator can withdraw all from pool.
  function emergencyExit() external {
    // check inside lib call

    _emergencyExitFromPool();
    StrategyLib2.sendOnEmergencyExit(controller(), baseState.asset, baseState.splitter);
  }

  /// @dev Manual claim rewards.
  function claim() external {
    StrategyLib2._checkManualClaim(controller());
    _claim();
  }

  // *************************************************************
  //                   GOVERNANCE ACTIONS
  // *************************************************************

  /// @notice Set performance fee, receiver and ratio
  function setupPerformanceFee(uint fee_, address receiver_, uint ratio_) external {
    StrategyLib2.setupPerformanceFee(baseState, fee_, receiver_, ratio_, controller());
  }

  // *************************************************************
  //                    DEPOSIT/WITHDRAW
  // *************************************************************

  /// @notice Stakes everything the strategy holds into the reward pool.
  /// amount_ Amount transferred to the strategy balance just before calling this function
  /// @param updateTotalAssetsBeforeInvest_ Recalculate total assets amount before depositing.
  ///                                       It can be false if we know exactly, that the amount is already actual.
  /// @return strategyLoss Loss should be checked and emitted
  function investAll(
    uint /*amount_*/,
    bool updateTotalAssetsBeforeInvest_
  ) external override returns (
    uint strategyLoss
  ) {
    uint balance = StrategyLib2._checkInvestAll(baseState.splitter, baseState.asset);

    if (balance > 0) {
      strategyLoss = _depositToPool(balance, updateTotalAssetsBeforeInvest_);
    }

    return strategyLoss;
  }

  /// @dev Withdraws all underlying assets to the vault
  /// @return strategyLoss Loss should be checked and emitted
  function withdrawAllToSplitter() external override returns (uint strategyLoss) {
    address _splitter = baseState.splitter;
    address _asset = baseState.asset;

    uint balance = StrategyLib2._checkSplitterSenderAndGetBalance(_splitter, _asset);

    (uint expectedWithdrewUSD, uint assetPrice, uint _strategyLoss) = _withdrawAllFromPool();

    StrategyLib2._withdrawAllToSplitterPostActions(
      _asset,
      balance,
      expectedWithdrewUSD,
      assetPrice,
      _splitter
    );
    return _strategyLoss;
  }

  /// @dev Withdraws some assets to the splitter
  /// @return strategyLoss Loss should be checked and emitted
  function withdrawToSplitter(uint amount) external override returns (uint strategyLoss) {
    address _splitter = baseState.splitter;
    address _asset = baseState.asset;

    uint balance = StrategyLib2._checkSplitterSenderAndGetBalance(_splitter, _asset);

    if (amount > balance) {
      uint expectedWithdrewUSD;
      uint assetPrice;

      (expectedWithdrewUSD, assetPrice, strategyLoss) = _withdrawFromPool(amount - balance);
      balance = StrategyLib2.checkWithdrawImpact(
        _asset,
        balance,
        expectedWithdrewUSD,
        assetPrice
      );
    }

    StrategyLib2._withdrawToSplitterPostActions(
      amount,
      balance,
      _asset,
      _splitter
    );
    return strategyLoss;
  }

  // *************************************************************
  //                       VIRTUAL
  // These functions must be implemented in the strategy contract
  // *************************************************************

  /// @dev Amount of underlying assets invested to the pool.
  function investedAssets() public view virtual returns (uint);

  /// @notice Deposit given amount to the pool.
  /// @param updateTotalAssetsBeforeInvest_ Recalculate total assets amount before depositing.
  ///                                       It can be false if we know exactly, that the amount is already actual.
  /// @return strategyLoss Loss should be checked and emitted
  function _depositToPool(
    uint amount,
    bool updateTotalAssetsBeforeInvest_
  ) internal virtual returns (
    uint strategyLoss
  );

  /// @dev Withdraw given amount from the pool.
  /// @return expectedWithdrewUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  /// @return strategyLoss Loss should be checked and emitted
  function _withdrawFromPool(uint amount) internal virtual returns (
    uint expectedWithdrewUSD,
    uint assetPrice,
    uint strategyLoss
  );

  /// @dev Withdraw all from the pool.
  /// @return expectedWithdrewUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  /// @return strategyLoss Loss should be checked and emitted
  function _withdrawAllFromPool() internal virtual returns (
    uint expectedWithdrewUSD,
    uint assetPrice,
    uint strategyLoss
  );

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  ///      Withdraw assets without impact checking.
  function _emergencyExitFromPool() internal virtual;

  /// @dev Claim all possible rewards.
  function _claim() internal virtual returns (address[] memory rewardTokens, uint[] memory amounts);

  /// @dev This empty reserved space is put in place to allow future versions to add new
  ///      variables without shifting down storage in the inheritance chain.
  ///      See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
  uint[50 - 7] private __gap;
}
