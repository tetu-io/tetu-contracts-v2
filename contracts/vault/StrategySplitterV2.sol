// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../openzeppelin/ReentrancyGuard.sol";
import "../openzeppelin/Math.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/EnumerableMap.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IProxyControlled.sol";
import "../proxy/ControllableV3.sol";

/// @title Proxy solution for connection a vault with multiple strategies
///        Version 2 has auto-rebalance logic adopted to strategies with fees.
/// @author belbix
contract StrategySplitterV2 is ControllableV3, ReentrancyGuard, ISplitter {
  using SafeERC20 for IERC20;
  using EnumerableMap for EnumerableMap.AddressToUintMap;

  // *********************************************
  //                  CONSTANTS
  // *********************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant SPLITTER_VERSION = "2.0.5";
  /// @dev APR denominator. Represent 100% APR.
  uint public constant APR_DENOMINATOR = 100_000;
  /// @dev Delay between hardwork calls for a strategy.
  uint public constant HARDWORK_DELAY = 12 hours;
  /// @dev How much APR history elements will be counted in average APR calculation.
  uint public constant HISTORY_DEEP = 3;
  /// @dev Time lock for adding new strategies.
  uint public constant TIME_LOCK = 18 hours;


  // *********************************************
  //                 VARIABLES
  // *********************************************

  /// @dev Underlying asset
  address public override asset;
  /// @dev Connected vault
  address public override vault;
  /// @dev Array of strategies under control
  address[] public strategies;
  /// @dev Paused strategies
  mapping(address => bool) public pausedStrategies;
  /// @dev Current strategies average APRs. Uses for deposit/withdraw ordering.
  mapping(address => uint) public strategiesAPR;
  /// @dev Strategies APR history. Uses for calculate average APR.
  mapping(address => uint[]) public strategiesAPRHistory;
  /// @dev Last strategies doHardWork call timestamp. Uses for calls delay.
  mapping(address => uint) public lastHardWorks;
  /// @dev Flag represents doHardWork call. Need for not call HW on deposit again in connected vault.
  bool public override isHardWorking;
  /// @dev Strategy => timestamp. Strategies scheduled for adding.
  EnumerableMap.AddressToUintMap internal _scheduledStrategies;
  /// @dev Changed to true after a strategy adding
  bool internal inited;
  /// @dev How much underlying can be invested to the strategy
  mapping(address => uint) public strategyCapacity;

  // *********************************************
  //                  EVENTS
  // *********************************************

  event StrategyAdded(address strategy, uint apr);
  event StrategyRemoved(address strategy);
  event Rebalance(
    address topStrategy,
    address lowStrategy,
    uint percent,
    uint slippageTolerance,
    uint slippage,
    uint lowStrategyBalance
  );
  event HardWork(
    address sender,
    address strategy,
    uint tvl,
    uint earned,
    uint lost,
    uint apr,
    uint avgApr
  );
  event StrategyScheduled(address strategy, uint startTime, uint timeLock);
  event ScheduledStrategyRemove(address strategy);
  event ManualAprChanged(address sender, address strategy, uint newApr, uint oldApr);
  event Paused(address strategy, address sender);
  event ContinueInvesting(address strategy, uint apr, address sender);
  event Loss(address strategy, uint amount);
  event Invested(address strategy, uint amount);
  event WithdrawFromStrategy(address strategy);
  event SetStrategyCapacity(address strategy, uint capacity);

  // *********************************************
  //                 INIT
  // *********************************************

  /// @dev Initialize contract after setup it as proxy implementation
  function init(address controller_, address _asset, address _vault) external initializer override {
    __Controllable_init(controller_);
    _requireERC20(_asset);
    asset = _asset;
    _requireInterface(_vault, InterfaceIds.I_TETU_VAULT_V2);
    vault = _vault;
  }

  // *********************************************
  //                 RESTRICTIONS
  // *********************************************

  /// @dev Restrict access only for governance
  function _onlyGov() internal view {
    require(isGovernance(msg.sender), "SS: Denied");
  }

  /// @dev Restrict access only for operators
  function _onlyOperators() internal view {
    require(IController(controller()).isOperator(msg.sender), "SS: Denied");
  }

  /// @dev Restrict access only for vault
  function _onlyVault() internal view {
    require(msg.sender == vault, "SS: Denied");
  }

  /// @dev Restrict access only for operators or vault
  function _onlyOperatorsOrVault() internal view {
    require(msg.sender == vault || IController(controller()).isOperator(msg.sender), "SS: Denied");
  }

  // *********************************************
  //                    VIEWS
  // *********************************************

  /// @dev Amount of underlying assets under control of splitter.
  function totalAssets() public view override returns (uint256){
    address _asset = asset;
    uint balance = IERC20(_asset).balanceOf(address(this));
    uint length = strategies.length;
    for (uint i = 0; i < length; i++) {
      balance += IStrategyV2(strategies[i]).totalAssets();
    }
    return balance;
  }

  /// @dev Return maximum available balance to withdraw without calling more than 1 strategy
  function maxCheapWithdraw() external view returns (uint) {
    address _asset = asset;
    uint strategyBalance;
    if (strategies.length != 0) {
      strategyBalance = IStrategyV2(strategies[0]).totalAssets();
    }
    return strategyBalance + IERC20(_asset).balanceOf(address(this));
  }

  /// @dev Length of strategy array
  function strategiesLength() external view returns (uint) {
    return strategies.length;
  }

  /// @dev Returns strategy array
  function allStrategies() external view returns (address[] memory) {
    return strategies;
  }

  /// @dev Length of APR history for given strategy
  function strategyAPRHistoryLength(address strategy) external view returns (uint) {
    return strategiesAPRHistory[strategy].length;
  }

  /// @dev Return all scheduled strategies with start lock time.
  function scheduledStrategies() external view returns (address[] memory _strategies, uint[] memory locks) {
    uint length = _scheduledStrategies.length();
    _strategies = new address[](length);
    locks = new uint[](length);
    for (uint i; i < length; ++i) {
      (_strategies[i], locks[i]) = _scheduledStrategies.at(i);
    }
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_SPLITTER || super.supportsInterface(interfaceId);
  }

  /// @dev There are strategy capacities of two kinds: external (from splitter) and internal (from strategy)
  ///      We should use minimum value (but: zero external capacity means no capacity)
  function getStrategyCapacity(address strategy) public view returns (uint capacity) {
    capacity = strategyCapacity[strategy];
    if (capacity == 0) {
      capacity = IStrategyV2(strategy).capacity();
    } else {
      capacity = Math.min(capacity, IStrategyV2(strategy).capacity());
    }
  }

  // *********************************************
  //                GOV ACTIONS
  // *********************************************

  /// @dev Schedule strategy for adding in the splitter.
  ///      Not inited splitter(without strategies) not require scheduling.
  function scheduleStrategies(address[] memory _strategies) external {
    _onlyGov();

    for (uint i; i < _strategies.length; i++) {
      require(_scheduledStrategies.set(_strategies[i], block.timestamp), "SS: Exist");
      emit StrategyScheduled(_strategies[i], block.timestamp, TIME_LOCK);
    }
  }

  /// @dev Remove scheduled strategies.
  function removeScheduledStrategies(address[] memory _strategies) external {
    _onlyGov();

    for (uint i; i < _strategies.length; i++) {
      require(_scheduledStrategies.remove(_strategies[i]), "SS: Not exist");
      emit ScheduledStrategyRemove(_strategies[i]);
    }
  }

  /// @dev Add new managed strategy. Should be an uniq address.
  ///      Strategy should have the same underlying asset with current contract.
  function addStrategies(address[] memory _strategies, uint[] memory expectedAPR) external {
    // only initial action will require strict access
    // already scheduled strategies can be added by anyone
    require(_strategies.length == expectedAPR.length, "WRONG_INPUT");

    bool _inited = inited;
    address[] memory existStrategies = strategies;
    address[] memory addedStrategies = new address[](_strategies.length);
    for (uint i = 0; i < _strategies.length; i++) {
      address strategy = _strategies[i];
      uint apr = expectedAPR[i];

      // --- restrictions ----------

      require(IStrategyV2(strategy).asset() == asset, "SS: Wrong asset");
      require(IStrategyV2(strategy).splitter() == address(this), "SS: Wrong splitter");
      require(IControllable(strategy).isController(controller()), "SS: Wrong controller");
      require(!_contains(existStrategies, strategy), "SS: Already exist");
      require(!_contains(addedStrategies, strategy), "SS: Duplicate");
      require(IProxyControlled(strategy).implementation() != address(0), "SS: Wrong proxy");
      // allow add strategies without time lock only for the fist call (assume the splitter is new)
      if (_inited) {
        (bool found, uint startTime) = _scheduledStrategies.tryGet(strategy);
        require(found && startTime != 0 && startTime + TIME_LOCK < block.timestamp, "SS: Time lock");
        _scheduledStrategies.remove(strategy);
      } else {
        // only initial action requires strict access
        _onlyGov();
      }
      // ----------------------------

      strategies.push(strategy);
      _setStrategyAPR(strategy, apr);
      addedStrategies[i] = strategy;
      lastHardWorks[strategy] = block.timestamp;
      emit StrategyAdded(strategy, apr);
    }
    _sortStrategiesByAPR();
    if (!_inited) {
      inited = true;
    }
  }

  /// @dev Remove given strategy, reset APR and withdraw all underlying to this contract
  function removeStrategies(address[] memory strategies_) external {
    _onlyGov();

    for (uint i = 0; i < strategies_.length; i++) {
      _removeStrategy(strategies_[i]);
    }
    _sortStrategiesByAPR();
  }

  function _removeStrategy(address strategy) internal {
    uint length = strategies.length;
    require(length > 0, "SS: Empty strategies");
    uint idx;
    bool found;
    for (uint256 i = 0; i < length; i++) {
      if (strategies[i] == strategy) {
        idx = i;
        found = true;
        break;
      }
    }
    require(found, "SS: Strategy not found");
    if (length > 1) {
      strategies[idx] = strategies[length - 1];
    }
    strategies.pop();

    _setStrategyAPR(strategy, 0);

    // for expensive strategies should be called before removing
    // without loss covering
    IStrategyV2(strategy).withdrawAllToSplitter();
    emit StrategyRemoved(strategy);
  }

  /// @dev Withdraw some percent from strategy with lowest APR and deposit to strategy with highest APR.
  ///      Strict access because possible losses during deposit/withdraw.
  /// @param percent Range of 1-100
  /// @param slippageTolerance Range of 0-100_000
  function rebalance(uint percent, uint slippageTolerance) external {
    _onlyGov();

    uint balance = totalAssets();
    uint length = strategies.length;
    require(length > 1, "SS: Length");
    require(percent <= 100, "SS: Percent");

    uint topStrategyWithoutCapacity = type(uint).max;

    for (uint i = 0; i < length; i++) {
      address strategy = strategies[i];
      uint capacity = getStrategyCapacity(strategy);
      if (capacity != 0) {
        uint strategyBalance = IStrategyV2(strategy).totalAssets();
        if (strategyBalance < capacity) {
          topStrategyWithoutCapacity = i;
          break;
        }
      } else {
        topStrategyWithoutCapacity = i;
        break;
      }
    }
    require(topStrategyWithoutCapacity != type(uint).max, "SS: All capped");


    address lowStrategy;

    uint lowStrategyBalance;
    // loop for all strategies since from top uncapped
    for (uint i = length; i > topStrategyWithoutCapacity + 1; i--) {
      lowStrategy = strategies[i - 1];
      lowStrategyBalance = IStrategyV2(lowStrategy).totalAssets();
      if (lowStrategyBalance == 0) {
        continue;
      }
      break;
    }

    // if we are able to withdraw something let's do it
    uint strategyLossOnWithdraw;
    if (lowStrategyBalance != 0) {
      strategyLossOnWithdraw = (percent == 100)
      ? IStrategyV2(lowStrategy).withdrawAllToSplitter()
      : IStrategyV2(lowStrategy).withdrawToSplitter(lowStrategyBalance * percent / 100);
    }

    (address topStrategy, uint strategyLossOnInvest) = _investToTopStrategy(
      false // we assume here, that total-assets-amount of the strategy was just updated in withdraw above
    );
    require(topStrategy != address(0), "SS: Not invested");

    uint slippage;
    // slippage for withdraw
    if (strategyLossOnWithdraw != 0) {
      ITetuVaultV2(vault).coverLoss(strategyLossOnWithdraw);
      emit Loss(lowStrategy, strategyLossOnWithdraw);
      slippage = strategyLossOnWithdraw * 100_000 / balance;
      require(slippage <= slippageTolerance, "SS: Slippage withdraw");
    }
    // slippage for invest
    if (strategyLossOnInvest > 0) {
      ITetuVaultV2(vault).coverLoss(strategyLossOnInvest);
      emit Loss(topStrategy, strategyLossOnInvest);
      slippage += strategyLossOnInvest * 100_000 / balance;
      require(slippage <= slippageTolerance, "SS: Slippage deposit");
    }

    emit Rebalance(
      topStrategy,
      lowStrategy,
      percent,
      slippageTolerance,
      slippage,
      lowStrategyBalance
    );
  }

  // *********************************************
  //                OPERATOR ACTIONS
  // *********************************************

  function setAPRs(address[] memory _strategies, uint[] memory aprs) external {
    _onlyOperators();
    require(_strategies.length == aprs.length, "WRONG_INPUT");
    for (uint i; i < aprs.length; i++) {
      address strategy = _strategies[i];
      require(!pausedStrategies[strategy], "SS: Paused");
      uint oldAPR = strategiesAPR[strategy];
      _setStrategyAPR(strategy, aprs[i]);
      emit ManualAprChanged(msg.sender, strategy, aprs[i], oldAPR);
    }
    _sortStrategiesByAPR();
  }

  /// @dev Pause investing. For withdraw need to call emergencyExit() on the strategy.
  function pauseInvesting(address strategy) external {
    _onlyOperators();
    require(!pausedStrategies[strategy], "SS: Paused");

    pausedStrategies[strategy] = true;
    uint oldAPR = strategiesAPR[strategy];
    _setStrategyAPR(strategy, 0);
    _sortStrategiesByAPR();
    emit ManualAprChanged(msg.sender, strategy, 0, oldAPR);
    emit Paused(strategy, msg.sender);
  }

  /// @dev Resumes the ability to invest for given strategy.
  function continueInvesting(address strategy, uint apr) external {
    _onlyOperators();
    require(pausedStrategies[strategy], "SS: Not paused");

    pausedStrategies[strategy] = false;
    _setStrategyAPR(strategy, apr);
    _sortStrategiesByAPR();
    emit ManualAprChanged(msg.sender, strategy, apr, 0);
    emit ContinueInvesting(strategy, apr, msg.sender);
  }

  function setStrategyCapacity(address strategy, uint capacity) external {
    _onlyOperators();
    strategyCapacity[strategy] = capacity;
    emit SetStrategyCapacity(strategy, capacity);
  }

  // *********************************************
  //                VAULT ACTIONS
  // *********************************************

  /// @dev Invest to the first strategy in the array. Assume this strategy has highest APR.
  function investAll() external override {
    _onlyVault();

    if (strategies.length != 0) {
      (address strategy, uint strategyLoss) = _investToTopStrategy(true);
      if (strategyLoss > 0) {
        ITetuVaultV2(msg.sender).coverLoss(strategyLoss);
        emit Loss(strategy, strategyLoss);
      }
    }
  }

  /// @dev Try to withdraw all from all strategies. May be too expensive to handle in one tx.
  function withdrawAllToVault() external override {
    _onlyVault();

    uint totalLoss;
    uint length = strategies.length;
    for (uint i = 0; i < length; i++) {
      uint strategyLoss = IStrategyV2(strategies[i]).withdrawAllToSplitter();
      emit WithdrawFromStrategy(strategies[i]);

      // register possible loses
      if (strategyLoss != 0) {
        emit Loss(strategies[i], strategyLoss);
        totalLoss += strategyLoss;
      }
    }

    address _vault = vault;

    if (totalLoss != 0) {
      ITetuVaultV2(_vault).coverLoss(totalLoss);
    }

    address _asset = asset;
    uint balanceAfter = IERC20(_asset).balanceOf(address(this));
    if (balanceAfter > 0) {
      IERC20(_asset).safeTransfer(_vault, balanceAfter);
    }
  }

  /// @dev Cascade withdraw from strategies start from lower APR until reach the target amount.
  ///      For large amounts with multiple strategies may not be possible to process this function.
  function withdrawToVault(uint256 amount) external override {
    _onlyVault();

    uint totalLoss;
    address _asset = asset;
    uint balance = IERC20(_asset).balanceOf(address(this));
    if (balance < amount) {
      uint remainingAmount = amount - balance;
      uint length = strategies.length;
      for (uint i = length; i > 0; i--) {
        IStrategyV2 strategy = IStrategyV2(strategies[i - 1]);

        uint strategyBalance = strategy.totalAssets();

        // withdraw from strategy
        uint strategyLoss = (strategyBalance <= remainingAmount)
        ? strategy.withdrawAllToSplitter()
        : strategy.withdrawToSplitter(remainingAmount);
        emit WithdrawFromStrategy(address(strategy));

        uint currentBalance = IERC20(_asset).balanceOf(address(this));
        // assume that we can not decrease splitter balance during withdraw process
        uint withdrew = currentBalance - balance;
        balance = currentBalance;

        remainingAmount = withdrew < remainingAmount ? remainingAmount - withdrew : 0;

        // register loss
        if (strategyLoss != 0) {
          emit Loss(address(strategy), strategyLoss);
          totalLoss += strategyLoss;
        }

        if (balance >= amount) {
          break;
        }
      }
    }

    address _vault = vault;
    // if we withdrew less than expected try to cover loss from vault insurance
    if (totalLoss != 0) {
      ITetuVaultV2(_vault).coverLoss(totalLoss);
    }

    if (balance != 0) {
      IERC20(_asset).safeTransfer(_vault, Math.min(amount, balance));
    }
  }

  // *********************************************
  //                HARD WORKS
  // *********************************************

  /// @dev Call hard works for all strategies.
  function doHardWork() external override {
    _onlyOperatorsOrVault();

    // prevent recursion
    require(!isHardWorking, "SS: Already in hard work");
    isHardWorking = true;
    uint length = strategies.length;
    bool needReorder;
    for (uint i = 0; i < length; i++) {
      bool result = _doHardWorkForStrategy(strategies[i], false);
      if (result) {
        needReorder = true;
      }
    }
    if (needReorder) {
      _sortStrategiesByAPR();
    }
    isHardWorking = false;
  }

  /// @dev Call hard work for given strategy.
  function doHardWorkForStrategy(address strategy, bool push) external {
    _onlyOperators();

    // prevent recursion
    require(!isHardWorking, "SS: Already in hard work");
    isHardWorking = true;
    bool result = _doHardWorkForStrategy(strategy, push);
    if (result) {
      _sortStrategiesByAPR();
    }
    isHardWorking = false;
  }

  function _doHardWorkForStrategy(address strategy, bool push) internal returns (bool) {
    uint lastHardWork = lastHardWorks[strategy];

    if (
      (
      lastHardWork + HARDWORK_DELAY < block.timestamp
      && IStrategyV2(strategy).isReadyToHardWork()
      && !pausedStrategies[strategy]
      )
      || push
    ) {
      uint sinceLastHardWork = block.timestamp - lastHardWork;
      uint tvl = IStrategyV2(strategy).totalAssets();
      if (tvl != 0) {
        (uint earned, uint lost) = IStrategyV2(strategy).doHardWork();
        uint apr;
        if (earned > lost) {
          apr = computeApr(tvl, earned - lost, sinceLastHardWork);
        }
        uint lostForCovering = lost > earned ? lost - earned : 0;
        if (lostForCovering > 0) {
          ITetuVaultV2(vault).coverLoss(lostForCovering);
        }

        strategiesAPRHistory[strategy].push(apr);
        uint avgApr = averageApr(strategy);
        strategiesAPR[strategy] = avgApr;
        lastHardWorks[strategy] = block.timestamp;

        emit HardWork(
          msg.sender,
          strategy,
          tvl,
          earned,
          lost,
          apr,
          avgApr
        );
        return true;
      }
    }
    return false;
  }

  function averageApr(address strategy) public view returns (uint) {
    uint[] storage history = strategiesAPRHistory[strategy];
    uint aprSum;
    uint length = history.length;
    uint count = Math.min(HISTORY_DEEP, length);
    if (count != 0) {
      for (uint i; i < count; i++) {
        aprSum += history[length - i - 1];
      }
      return aprSum / count;
    }
    return 0;
  }

  /// @dev https://www.investopedia.com/terms/a/apr.asp
  ///      TVL and rewards should be in the same currency and with the same decimals
  function computeApr(uint tvl, uint earned, uint duration) public pure returns (uint) {
    if (tvl == 0 || duration == 0) {
      return 0;
    }
    return earned * 1e18 * APR_DENOMINATOR * uint(365) / tvl / (duration * 1e18 / 1 days);
  }

  /// @dev Insertion sorting algorithm for using with arrays fewer than 10 elements.
  ///      Based on https://medium.com/coinmonks/sorting-in-solidity-without-comparison-4eb47e04ff0d
  ///      Sort strategies array by APR values from strategiesAPR map. Highest to lowest.
  function _sortStrategiesByAPR() internal {
  unchecked {
    uint length = strategies.length;
    for (uint i = 1; i < length; i++) {
      address key = strategies[i];
      uint j = i - 1;
      while ((int(j) >= 0) && strategiesAPR[strategies[j]] < strategiesAPR[key]) {
        strategies[j + 1] = strategies[j];
        j--;
      }
      strategies[j + 1] = key;
    }
  }
  }

  /// @dev Return true if given item found in address array
  function _contains(address[] memory array, address _item) internal pure returns (bool) {
    for (uint256 i = 0; i < array.length; i++) {
      if (array[i] == _item) {
        return true;
      }
    }
    return false;
  }

  function _setStrategyAPR(address strategy, uint apr) internal {
    strategiesAPR[strategy] = apr;
    // need to override last values of history for properly calculate average apr
    for (uint i; i < HISTORY_DEEP; i++) {
      strategiesAPRHistory[strategy].push(apr);
    }
  }

  /// @param updateTotalAssetsBeforeInvest TotalAssets of strategy should be updated before investing.
  /// @return strategy Selected strategy or zero
  /// @return strategyLoss Loss should be covered from Insurance
  function _investToTopStrategy(
    bool updateTotalAssetsBeforeInvest
  ) internal returns (
    address strategy,
    uint strategyLoss
  ) {
    address _asset = asset;
    uint balance = IERC20(_asset).balanceOf(address(this));
    // no actions for zero balance, return empty strategy
    if (balance != 0) {
      uint length = strategies.length;
      for (uint i; i < length; ++i) {
        strategy = strategies[i];
        if (pausedStrategies[strategy]) {
          continue;
        }

        uint capacity = getStrategyCapacity(strategy);

        uint strategyBalance = IStrategyV2(strategy).totalAssets();
        uint toInvest;
        if (capacity > strategyBalance) {
          toInvest = Math.min(capacity - strategyBalance, balance);
        } else {
          continue;
        }

        if (toInvest != 0) {
          IERC20(_asset).safeTransfer(strategy, toInvest);
          strategyLoss = IStrategyV2(strategy).investAll(toInvest, updateTotalAssetsBeforeInvest);
          emit Invested(strategy, toInvest);
          break;
        }
      }
    }

    return (strategy, strategyLoss);
  }

}
