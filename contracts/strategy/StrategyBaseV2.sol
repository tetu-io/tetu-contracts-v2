// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../interfaces/IStrategyV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IForwarder.sol";
import "../proxy/ControllableV3.sol";
import "./StrategyLib.sol";

/// @title Abstract contract for base strategy functionality
/// @author belbix
abstract contract StrategyBaseV2 is IStrategyV2, ControllableV3 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant STRATEGY_BASE_VERSION = "2.3.0";
  /// @notice 10% of total profit is sent to {performanceReceiver} before compounding
  uint internal constant DEFAULT_PERFORMANCE_FEE = 10_000;
  address internal constant DEFAULT_PERF_FEE_RECEIVER = 0x9Cc199D4353b5FB3e6C8EEBC99f5139e0d8eA06b;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Underlying asset
  address public override asset;
  /// @dev Linked splitter
  address public override splitter;
  /// @dev Percent of profit for autocompound inside this strategy.
  uint public override compoundRatio;
  uint private __deprecatedSlot1;

  /// @notice {performanceFee}% of total profit is sent to {performanceReceiver} before compounding
  /// @dev governance by default
  address public override performanceReceiver;

  /// @notice A percent of total profit that is sent to the {performanceReceiver} before compounding
  /// @dev {DEFAULT_PERFORMANCE_FEE} by default, FEE_DENOMINATOR is used
  uint public override performanceFee;
  /// @dev Represent specific name for this strategy. Should include short strategy name and used assets. Uniq across the vault.
  string public override strategySpecificName;

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @notice Initialize contract after setup it as proxy implementation
  function __StrategyBase_init(
    address controller_,
    address _splitter
  ) internal onlyInitializing {
    _requireInterface(_splitter, InterfaceIds.I_SPLITTER);
    __Controllable_init(controller_);

    require(IControllable(_splitter).isController(controller_), StrategyLib.WRONG_VALUE);

    asset = ISplitter(_splitter).asset();
    splitter = _splitter;

    performanceReceiver = DEFAULT_PERF_FEE_RECEIVER;
    performanceFee = DEFAULT_PERFORMANCE_FEE;
  }

  // *************************************************************
  //                     PERFORMANCE FEE
  // *************************************************************
  /// @notice Set performance fee and receiver
  function setupPerformanceFee(uint fee_, address receiver_) external {
    StrategyLib._checkSetupPerformanceFee(controller(), fee_, receiver_);
    performanceFee = fee_;
    performanceReceiver = receiver_;
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Total amount of underlying assets under control of this strategy.
  function totalAssets() public view override returns (uint) {
    return IERC20(asset).balanceOf(address(this)) + investedAssets();
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_STRATEGY_V2 || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                   VOTER ACTIONS
  // *************************************************************

  /// @dev PlatformVoter can change compound ratio for some strategies.
  ///      A strategy can implement another logic for some uniq cases.
  function setCompoundRatio(uint value) external virtual override {
    StrategyLib._checkCompoundRatioChanged(controller(), compoundRatio, value);
    compoundRatio = value;
  }

  // *************************************************************
  //                   OPERATOR ACTIONS
  // *************************************************************

  /// @dev The name will be used for UI.
  function setStrategySpecificName(string calldata name) external {
    StrategyLib._checkStrategySpecificNameChanged(controller(), name);
    strategySpecificName = name;
  }

  /// @dev In case of any issue operator can withdraw all from pool.
  function emergencyExit() external {
    // check inside lib call

    _emergencyExitFromPool();
    StrategyLib.sendOnEmergencyExit(controller(), asset, splitter);
  }

  /// @dev Manual claim rewards.
  function claim() external {
    StrategyLib._checkManualClaim(controller());
    _claim();
  }

  // *************************************************************
  //                    DEPOSIT/WITHDRAW
  // *************************************************************

  /// @notice Stakes everything the strategy holds into the reward pool.
  /// amount_ Amount transferred to the strategy balance just before calling this function
  /// @param updateTotalAssetsBeforeInvest_ Recalculate total assets amount before depositing.
  ///                                       It can be false if we know exactly, that the amount is already actual.
  /// @return strategyLoss Loss should be covered from Insurance
  function investAll(
    uint /*amount_*/,
    bool updateTotalAssetsBeforeInvest_
  ) external override returns (
    uint strategyLoss
  ) {
    uint balance = StrategyLib._checkInvestAll(splitter, asset);

    if (balance > 0) {
      strategyLoss = _depositToPool(balance, updateTotalAssetsBeforeInvest_);
    }

    return strategyLoss;
  }

  /// @dev Withdraws all underlying assets to the vault
  /// @return strategyLoss Loss should be covered from Insurance
  function withdrawAllToSplitter() external override returns (uint strategyLoss) {
    address _splitter = splitter;
    address _asset = asset;

    uint balance = StrategyLib._checkSplitterSenderAndGetBalance(_splitter, _asset);

    (uint expectedWithdrewUSD, uint assetPrice, uint _strategyLoss) = _withdrawAllFromPool();

    StrategyLib._withdrawAllToSplitterPostActions(
      _asset,
      balance,
      expectedWithdrewUSD,
      assetPrice,
      _splitter
    );
    return _strategyLoss;
  }

  /// @dev Withdraws some assets to the splitter
  /// @return strategyLoss Loss should be covered from Insurance
  function withdrawToSplitter(uint amount) external override returns (uint strategyLoss) {
    address _splitter = splitter;
    address _asset = asset;

    uint balance = StrategyLib._checkSplitterSenderAndGetBalance(_splitter, _asset);

    if (amount > balance) {
      uint expectedWithdrewUSD;
      uint assetPrice;

      (expectedWithdrewUSD, assetPrice, strategyLoss) = _withdrawFromPool(amount - balance);
      balance = StrategyLib.checkWithdrawImpact(
        _asset,
        balance,
        expectedWithdrewUSD,
        assetPrice,
        _splitter
      );
    }

    StrategyLib._withdrawToSplitterPostActions(
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
  /// @return strategyLoss Loss should be covered from Insurance
  function _depositToPool(
    uint amount,
    bool updateTotalAssetsBeforeInvest_
  ) internal virtual returns (
    uint strategyLoss
  );

  /// @dev Withdraw given amount from the pool.
  /// @return expectedWithdrewUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  /// @return strategyLoss Loss should be covered from Insurance
  function _withdrawFromPool(uint amount) internal virtual returns (
    uint expectedWithdrewUSD,
    uint assetPrice,
    uint strategyLoss
  );

  /// @dev Withdraw all from the pool.
  /// @return expectedWithdrewUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  /// @return strategyLoss Loss should be covered from Insurance
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
  uint[43] private __gap;
}
