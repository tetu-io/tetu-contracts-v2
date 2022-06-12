// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/ReentrancyGuard.sol";
import "../openzeppelin/Math.sol";
import "../openzeppelin/SafeERC20.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/ISplitter.sol";
import "../proxy/ControllableV3.sol";

import "hardhat/console.sol";

/// @title Proxy solution for connection a vault with multiple strategies
///        Version 2 has auto-rebalance logic adopted to strategies with fees.
/// @author belbix
contract StrategySplitterV2 is ControllableV3, ReentrancyGuard, ISplitter {
  using SafeERC20 for IERC20;

  // *********************************************
  //                  CONSTANTS
  // *********************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant SPLITTER_VERSION = "2.0.0";
  /// @dev APR denominator. Represent 100% APR.
  uint public constant APR_DENOMINATOR = 100_000;
  /// @dev Delay between hardwork calls for a strategy.
  uint public constant HARDWORK_DELAY = 12 hours;
  /// @dev How much APR history elements will be counted in average APR calculation.
  uint public constant HISTORY_DEEP = 3;
  /// @dev Time lock for adding new strategies.
  uint public constant TIME_LOCK = 12 hours;


  // *********************************************
  //                 VARIABLES
  // *********************************************

  /// @dev Underlying asset
  address public override asset;
  /// @dev Connected vault
  address public override vault;
  /// @dev Array of strategies under control
  address[] public strategies;
  /// @dev Current strategies average APRs. Uses for deposit/withdraw ordering.
  mapping(address => uint) public strategiesAPR;
  /// @dev Strategies APR history. Uses for calculate average APR.
  mapping(address => uint[]) public strategiesAPRHistory;
  /// @dev Last strategies doHardWork call timestamp. Uses for calls delay.
  mapping(address => uint) public lastHardWorks;
  /// @dev Flag represents doHardWork call. Need for not call HW on deposit again in connected vault.
  bool public override isHardWorking;
  /// @dev Strategy => timestamp. Strategies scheduled for adding.
  mapping(address => uint) scheduledStrategies;
  /// @dev Changed to true after a strategy adding
  bool inited;

  // *********************************************
  //                  EVENTS
  // *********************************************

  event StrategyAdded(address strategy, uint apr);
  event StrategyRemoved(address strategy);
  event StrategyRatioChanged(address strategy, uint ratio);
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

  // *********************************************
  //                 INIT
  // *********************************************

  /// @dev Initialize contract after setup it as proxy implementation
  function init(address controller_, address _asset, address _vault) external initializer override {
    __Controllable_init(controller_);
    asset = _asset;
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

  // *********************************************
  //                GOV ACTIONS
  // *********************************************

  function scheduleStrategies(address[] memory _strategies) external {
    _onlyGov();

    for (uint i; i < _strategies.length; i++) {
      scheduledStrategies[_strategies[i]] = block.timestamp;
      emit StrategyScheduled(_strategies[i], block.timestamp, TIME_LOCK);
    }
  }

  /// @dev Add new managed strategy. Should be an uniq address.
  ///      Strategy should have the same underlying asset with current contract.
  function addStrategies(address[] memory _strategies, uint[] memory expectedAPR) external {
    _onlyGov();

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
      // allow add strategies without time lock only for the fist call (assume the splitter is new)
      if (_inited) {
        uint startTime = scheduledStrategies[strategy];
        require(startTime != 0 && startTime + TIME_LOCK < block.timestamp, "SS: Time lock");
        scheduledStrategies[strategy] = 0;
      }
      // ----------------------------

      strategies.push(strategy);
      strategiesAPR[strategy] = apr;
      for (uint j; j < HISTORY_DEEP; j++) {
        strategiesAPRHistory[strategy].push(apr);
      }
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

  function _removeStrategy(address _strategy) internal {
    uint length = strategies.length;
    require(length > 0, "SS: Empty strategies");
    uint idx;
    bool found;
    for (uint256 i = 0; i < length; i++) {
      if (strategies[i] == _strategy) {
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

    strategiesAPR[_strategy] = 0;

    // for expensive strategies should be called before removing
    IStrategyV2(_strategy).withdrawAll();
    emit StrategyRemoved(_strategy);
  }


  // *********************************************
  //                OPERATOR ACTIONS
  // *********************************************

  /// @dev Withdraw some percent from strategy with lowest APR and deposit to strategy with highest APR.
  /// @param percent Range of 1-100
  /// @param slippageTolerance Range of 0-100_000
  function rebalance(uint percent, uint slippageTolerance) external {
    _onlyOperators();

    uint balance = totalAssets();

    uint length = strategies.length;
    require(length > 1, "SS: Length");
    require(percent <= 100, "SS: Percent");

    address topStrategy = strategies[0];
    address lowStrategy;

    uint lowStrategyBalance;
    for (uint i = length; i > 1; i--) {
      lowStrategy = strategies[i - 1];
      lowStrategyBalance = IStrategyV2(lowStrategy).totalAssets();
    }
    require(lowStrategyBalance != 0, "SS: No strategies");

    IStrategyV2(lowStrategy).withdraw(lowStrategyBalance * percent / 100);

    address _asset = asset;
    IERC20(_asset).safeTransfer(topStrategy, IERC20(_asset).balanceOf(address(this)));
    IStrategyV2(topStrategy).investAll();

    uint balanceAfter = totalAssets();
    uint slippage = (balance - balanceAfter) * 100_000 / balance;
    require(slippage <= slippageTolerance, "SS: Slippage");

    emit Rebalance(
      topStrategy,
      lowStrategy,
      percent,
      slippageTolerance,
      slippage,
      lowStrategyBalance
    );
  }

  function setAPRs(address[] memory _strategies, uint[] memory aprs) external {
    _onlyOperators();
    for (uint i; i < aprs.length; i++) {
      address strategy = _strategies[i];
      strategiesAPR[strategy] = aprs[i];
      // need to override last values of history for properly calculate average apr
      for (uint j; j < HISTORY_DEEP; j++) {
        strategiesAPRHistory[strategy].push(aprs[i]);
      }
    }
    _sortStrategiesByAPR();
  }

  // *********************************************
  //                VAULT ACTIONS
  // *********************************************

  /// @dev Invest to the first strategy in the array. Assume this strategy has highest APR.
  function investAll() external override {
    _onlyVault();

    if (strategies.length != 0) {
      address _asset = asset;
      uint balance = IERC20(_asset).balanceOf(address(this));
      address strategy = strategies[0];
      IERC20(_asset).safeTransfer(strategy, balance);
      IStrategyV2(strategy).investAll();
    }
  }

  /// @dev Try to withdraw all from all strategies. May be too expensive to handle in one tx.
  function withdrawAllToVault() external override {
    _onlyVault();

    address _asset = asset;
    uint balance = totalAssets();

    uint length = strategies.length;
    for (uint i = 0; i < length; i++) {
      IStrategyV2(strategies[i]).withdrawAll();
    }

    uint balanceAfter = IERC20(_asset).balanceOf(address(this));

    address _vault = vault;
    // if we withdrew not enough try to cover loss from vault insurance
    if (balanceAfter < balance) {
      ITetuVaultV2(_vault).coverLoss(balance - balanceAfter);
    }

    if (balanceAfter > 0) {
      IERC20(_asset).safeTransfer(_vault, balanceAfter);
    }
  }

  /// @dev Cascade withdraw from strategies start from lower APR until reach the target amount.
  ///      For large amounts with multiple strategies may not be possible to process this function.
  function withdrawToVault(uint256 amount) external override {
    _onlyVault();

    address _asset = asset;
    uint balance = IERC20(_asset).balanceOf(address(this));
    if (balance < amount) {
      uint length = strategies.length;
      for (uint i = length; i > 0; i--) {
        IStrategyV2 strategy = IStrategyV2(strategies[i - 1]);
        uint strategyBalance = strategy.totalAssets();
        if (strategyBalance <= amount) {
          strategy.withdrawAll();
        } else {
          strategy.withdraw(amount);
        }
        balance = IERC20(_asset).balanceOf(address(this));
        if (balance >= amount) {
          break;
        }
      }
    }

    address _vault = vault;
    // if we withdrew not enough try to cover loss from vault insurance
    if (amount > balance) {
      ITetuVaultV2(_vault).coverLoss(amount - balance);
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
    isHardWorking = true;
    uint length = strategies.length;
    bool needReorder;
    for (uint i = 0; i < length; i++) {
      bool result = _doHardWorkForStrategy(strategies[i]);
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
  function doHardWorkForStrategy(address strategy) external {
    _onlyOperators();

    // prevent recursion
    isHardWorking = true;
    bool result = _doHardWorkForStrategy(strategy);
    if (result) {
      _sortStrategiesByAPR();
    }
    isHardWorking = false;
  }

  function _doHardWorkForStrategy(address strategy) internal returns (bool) {
    uint lastHardWork = lastHardWorks[strategy];

    if (lastHardWork + HARDWORK_DELAY < block.timestamp) {
      uint sinceLastHardWork = block.timestamp - lastHardWork;
      uint tvl = IStrategyV2(strategy).totalAssets();
      console.log("HW tvl", tvl);
      if (tvl != 0) {
        (uint earned, uint lost) = IStrategyV2(strategy).doHardWork();
        uint apr;
        if (earned > lost) {
          apr = computeApr(tvl, earned - lost, sinceLastHardWork);
        }

        strategiesAPRHistory[strategy].push(apr);
        uint avgApr = averageApr(strategy);
        strategiesAPR[strategy] = avgApr;
        lastHardWorks[strategy] = block.timestamp;


        console.log("HW earned", earned);
        console.log("HW lost", lost);
        console.log("HW sinceLastHardWork", sinceLastHardWork);
        console.log("HW apr", apr);
        console.log("HW avgApr", avgApr);

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

}
