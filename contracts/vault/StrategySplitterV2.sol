// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;
//
//import "../proxy/ControllableV3.sol";
//import "../openzeppelin/ReentrancyGuard.sol";
//import "../openzeppelin/Math.sol";
//import "../openzeppelin/SafeERC20.sol";
//import "../interfaces/IStrategySplitter.sol";
//import "../interfaces/IERC4626.sol";
//import "../interfaces/IStrategy.sol";
//
///// @title Proxy solution for connection a vault with multiple strategies
///// @dev Should be used with TetuProxyControlled.sol
///// @author belbix
//contract StrategySplitterV2 is ControllableV3, ReentrancyGuard, IStrategySplitter, IStrategy {
//  using SafeERC20 for IERC20;
//  using SlotsLib for bytes32;
//
//  // *********************************************
//  //                  CONSTANTS
//  // *********************************************
//
//  /// @notice Strategy type for statistical purposes
//  string public constant override STRATEGY_NAME = "StrategySplitterV2";
//  /// @notice Version of the contract
//  /// @dev Should be incremented when contract changed
//  string public constant VERSION = "2.0.0";
//  uint internal constant _PRECISION = 1e18;
//  uint public constant STRATEGY_RATIO_DENOMINATOR = 100;
//  uint public constant WITHDRAW_REQUEST_TIMEOUT = 1 hours;
//  /// @dev Threshold for any operations. Avoid unnecessary actions when rounding failed.
//  uint internal constant _MIN_OP = 1;
//
//  bytes32 internal constant _UNDERLYING_SLOT = bytes32(uint256(keccak256("tetu.splitter.underlying")) - 1);
//  bytes32 internal constant _VAULT_SLOT = bytes32(uint256(keccak256("tetu.splitter.vault")) - 1);
//  bytes32 internal constant _RATIOS_SUM_SLOT = bytes32(uint256(keccak256("tetu.splitter.ratios.sum")) - 1);
//  bytes32 internal constant _NEED_REBALANCE_SLOT = bytes32(uint256(keccak256("tetu.splitter.need.rebalance")) - 1);
//  bytes32 internal constant _WANT_WITHDRAW_SLOT = bytes32(uint256(keccak256("tetu.splitter.want.withdraw")) - 1);
//  bytes32 internal constant _PAUSE_SLOT = bytes32(uint256(keccak256("tetu.splitter.pause")) - 1);
//
//  // *********************************************
//  //                 VARIABLES
//  // *********************************************
//
//  address[] public override strategies;
//  mapping(address => uint) public override strategiesRatios;
//  mapping(address => uint) public override withdrawRequestsCalls;
//
//  // *********************************************
//  //                  EVENTS
//  // *********************************************
//
//  event StrategyAdded(address strategy);
//  event StrategyRemoved(address strategy);
//  event StrategyRatioChanged(address strategy, uint ratio);
//  event RequestWithdraw(address user, uint amount, uint time);
//  event Salvage(address recipient, address token, uint256 amount);
//  event RebalanceAll(uint underlyingBalance, uint strategiesBalancesSum);
//  event Rebalance(address strategy);
//
//  /// @notice Initialize contract after setup it as proxy implementation
//  /// @dev Use it only once after first logic setup
//  ///      Initialize Controllable with sender address
//  function initialize(
//    address _controller,
//    address _underlying,
//    address __vault
//  ) external initializer {
//    __Controllable_init(_controller);
//    _UNDERLYING_SLOT.set(_underlying);
//    _VAULT_SLOT.set(__vault);
//  }
//
//  // *********************************************
//  //                 RESTRICTIONS
//  // *********************************************
//
//  /// @dev Only for linked Vault or Governance/Controller.
//  ///      Use for functions that should have strict access.
//  function _restricted() internal view {
//    address c = controller();
//    require(msg.sender == _VAULT_SLOT.getAddress()
//    || msg.sender == c
//      || IController(c).governance() == msg.sender,
//      "SS: Not Gov or Vault");
//  }
//
//  /// @dev Extended strict access with including HardWorkers addresses
//  ///      Use for functions that should be called by HardWorkers
//  function _onlyOperators() internal view {
//    address c = controller();
//    require(msg.sender == _VAULT_SLOT.getAddress()
//    || msg.sender == c
//    || IController(c).governance() == msg.sender
//      || IController(c).isOperator(msg.sender),
//      "SS: Not Operator");
//  }
//
//  // *********************************************
//  //            SPLITTER SPECIFIC LOGIC
//  // *********************************************
//
//  /// @dev Add new managed strategy. Should be an uniq address.
//  ///      Strategy should have the same underlying with current contract.
//  ///      The new strategy will have zero rate. Need to setup correct rate later.
//  function addStrategies(address[] memory strategies_) external override {
//    _restricted();
//    for (uint i = 0; i < strategies_.length; i++) {
//      _addStrategy(strategies_[i]);
//    }
//  }
//
//  function _addStrategy(address _strategy) internal {
//    require(IStrategy(_strategy).underlying() == _UNDERLYING_SLOT.getAddress(), "SS: Wrong underlying");
//    require(!_contains(strategies, _strategy), "SS: Already exist");
//    strategies.push(_strategy);
//    emit StrategyAdded(_strategy);
//  }
//
//  /// @dev Remove given strategy, reset the ratio and withdraw all underlying to this contract
//  function removeStrategies(address[] memory strategies_) external override {
//    _restricted();
//    for (uint i = 0; i < strategies_.length; i++) {
//      _removeStrategy(strategies_[i]);
//    }
//  }
//
//  function _removeStrategy(address _strategy) internal {
//    // todo investigate
//    // require(strategies.length > 1, "SS: Can't remove last strategy");
//
//    uint length = strategies.length;
//    require(length > 0, "SS: Empty strategies");
//    uint idx;
//    bool found;
//    for (uint256 i = 0; i < length; i++) {
//      if (strategies[i] == _strategy) {
//        idx = i;
//        found = true;
//        break;
//      }
//    }
//    require(found, "SS: Strategy not found");
//    if (length > 1) {
//      strategies[idx] = strategies[length - 1];
//    }
//    strategies.pop();
//
//    uint ratio = strategiesRatios[_strategy];
//    strategiesRatios[_strategy] = 0;
//    if (ratio != 0) {
//      address strategyWithHighestRatio = strategies[0];
//      strategiesRatios[strategyWithHighestRatio] = ratio + strategiesRatios[strategyWithHighestRatio];
//    }
//    sortStrategiesByRatiosReverted();
//    IERC20(_UNDERLYING_SLOT.getAddress()).safeApprove(_strategy, 0);
//    // for expensive strategies should be called before removing
//    IStrategy(_strategy).withdrawAllToVault();
//    emit StrategyRemoved(_strategy);
//  }
//
//  /// @dev Insertion sorting algorithm for using with arrays fewer than 10 elements
//  ///      Based on https://medium.com/coinmonks/sorting-in-solidity-without-comparison-4eb47e04ff0d
//  function sortStrategiesByRatiosReverted() internal {
//    for (uint i = 1; i < strategies.length; i++) {
//      address key = strategies[i];
//      uint j = i - 1;
//      while ((int(j) >= 0) && strategiesRatios[strategies[j]] < strategiesRatios[key]) {
//        strategies[j + 1] = strategies[j];
//      unchecked {j--;}
//      }
//    unchecked {
//      strategies[j + 1] = key;
//    }
//    }
//  }
//
//  function setStrategyRatios(address[] memory _strategies, uint[] memory _ratios) external override {
//    _onlyOperators();
//    require(_strategies.length == strategies.length, "SS: Wrong input strategies");
//    require(_strategies.length == _ratios.length, "SS: Wrong input arrays");
//    uint sum;
//    for (uint i; i < _strategies.length; i++) {
//      bool exist = false;
//      for (uint j; j < strategies.length; j++) {
//        if (strategies[j] == _strategies[i]) {
//          exist = true;
//          break;
//        }
//      }
//      require(exist, "SS: Strategy not exist");
//      sum += _ratios[i];
//      strategiesRatios[_strategies[i]] = _ratios[i];
//      emit StrategyRatioChanged(_strategies[i], _ratios[i]);
//    }
//    require(sum == STRATEGY_RATIO_DENOMINATOR, "SS: Wrong sum");
//
//    sortStrategiesByRatiosReverted();
//  }
//
//  /// @dev It is a little trick how to determinate was strategy fully initialized or not.
//  ///      When we add strategies we don't setup ratios immediately.
//  ///      Strategy ratios if setup once the sum must be equal to denominator.
//  ///      It means zero sum of ratios will indicate that this contract was never initialized.
//  ///      Until we setup ratios we able to add strategies without time-lock.
//  function strategiesInited() external view override returns (bool) {
//    uint sum;
//    for (uint i; i < strategies.length; i++) {
//      sum += strategiesRatios[strategies[i]];
//    }
//    return sum == STRATEGY_RATIO_DENOMINATOR;
//  }
//
//  // *************** STRATEGY GOVERNANCE ACTIONS **************
//
//  /// @dev Try to withdraw all from all strategies. May be too expensive to handle in one tx
//  function withdrawAllToVault() external override {
//    _onlyOperators();
//    for (uint i = 0; i < strategies.length; i++) {
//      IStrategy(strategies[i]).withdrawAllToVault();
//    }
//    transferAllUnderlyingToVault();
//  }
//
//  /// @dev We can't call emergency exit on strategies
//  ///      Transfer all available tokens to the vault
//  function emergencyExit() external override {
//    _restricted();
//    transferAllUnderlyingToVault();
//    _PAUSE_SLOT.set(1);
//  }
//
//  /// @dev Cascade withdraw from strategies start from with higher ratio until reach the target amount.
//  ///      For large amounts with multiple strategies may not be possible to process this function.
//  function withdrawToVault(uint256 amount) external override {
//    _onlyOperators();
//    address _underlying = _UNDERLYING_SLOT.getAddress();
//    uint uBalance = IERC20(_underlying).balanceOf(address(this));
//    if (uBalance < amount) {
//      for (uint i; i < strategies.length; i++) {
//        IStrategy strategy = IStrategy(strategies[i]);
//        uint strategyBalance = strategy.investedUnderlyingBalance();
//        if (strategyBalance <= amount) {
//          strategy.withdrawAllToVault();
//        } else {
//          if (amount > _MIN_OP) {
//            strategy.withdrawToVault(amount);
//          }
//        }
//        uBalance = IERC20(_underlying).balanceOf(address(this));
//        if (uBalance >= amount) {
//          break;
//        }
//      }
//    }
//    transferAllUnderlyingToVault();
//  }
//
//  /// @dev User may indicate that he wants to withdraw given amount
//  ///      We will try to transfer given amount to this contract in a separate transaction
//  function requestWithdraw(uint _amount) external nonReentrant {
//    uint lastRequest = withdrawRequestsCalls[msg.sender];
//    if (lastRequest != 0) {
//      // anti-spam protection
//      require(lastRequest + WITHDRAW_REQUEST_TIMEOUT < block.timestamp, "SS: Request timeout");
//    }
//    address _vault = _VAULT_SLOT.getAddress();
//    uint shares = IERC20(_vault).balanceOf(msg.sender);
//    uint userBalance = IERC4626(_vault).convertToAssets(shares);
//    // add 10 for avoid rounding troubles
//    require(_amount <= userBalance + 10, "SS: You want too much");
//    uint want = _WANT_WITHDRAW_SLOT.getUint() + _amount;
//    // add 10 for avoid rounding troubles
//    require(want <= _investedUnderlyingBalance() + 10, "SS: Want more than balance");
//    _WANT_WITHDRAW_SLOT.set(want);
//
//    withdrawRequestsCalls[msg.sender] = block.timestamp;
//    emit RequestWithdraw(msg.sender, _amount, block.timestamp);
//  }
//
//  /// @dev User can try to withdraw requested amount from the first eligible strategy.
//  ///      In case of big request should be called multiple time
//  function processWithdrawRequests() external nonReentrant {
//    address _underlying = _UNDERLYING_SLOT.getAddress();
//    uint balance = IERC20(_underlying).balanceOf(address(this));
//    uint want = _WANT_WITHDRAW_SLOT.getUint();
//    if (balance >= want) {
//      // already have enough balance
//      _WANT_WITHDRAW_SLOT.set(uint(0));
//      return;
//    }
//    // we should not want to withdraw more than we have
//    // _investedUnderlyingBalance always higher than balance
//    uint wantAdjusted = Math.min(want, _investedUnderlyingBalance()) - balance;
//    for (uint i; i < strategies.length; i++) {
//      IStrategy _strategy = IStrategy(strategies[i]);
//      uint strategyBalance = _strategy.investedUnderlyingBalance();
//      if (strategyBalance == 0) {
//        // suppose we withdrew all in previous calls
//        continue;
//      }
//      if (strategyBalance > wantAdjusted) {
//        if (wantAdjusted > _MIN_OP) {
//          _strategy.withdrawToVault(wantAdjusted);
//        }
//      } else {
//        // we don't have enough amount in this strategy
//        // withdraw all and call this function again
//        _strategy.withdrawAllToVault();
//      }
//      // withdraw only from 1 eligible strategy
//      break;
//    }
//
//    // update want to withdraw
//    if (IERC20(_underlying).balanceOf(address(this)) >= want) {
//      _WANT_WITHDRAW_SLOT.set(uint(0));
//    }
//  }
//
//  /// @dev Transfer token to recipient if it is not in forbidden list
//  function salvage(address recipient, address token, uint256 amount) external override {
//    _restricted();
//    require(token != _UNDERLYING_SLOT.getAddress(), "SS: Not salvageable");
//    // To make sure that governance cannot come in and take away the coins
//    for (uint i = 0; i < strategies.length; i++) {
//      require(!IStrategy(strategies[i]).unsalvageableTokens(token), "SS: Not salvageable");
//    }
//    IERC20(token).safeTransfer(recipient, amount);
//    emit Salvage(recipient, token, amount);
//  }
//
//  /// @dev Expensive call, probably will need to call each strategy in separated txs
//  function doHardWork() external override {
//    _onlyOperators();
//    for (uint i = 0; i < strategies.length; i++) {
//      IStrategy(strategies[i]).doHardWork();
//    }
//  }
//
//  /// @dev Don't invest for keeping tx cost cheap
//  ///      Need to call rebalance after this
//  function investAllUnderlying() external override {
//    _onlyOperators();
//    _NEED_REBALANCE_SLOT.set(uint(1));
//  }
//
//  /// @dev Rebalance all strategies in one tx
//  ///      Require a lot of gas and should be used carefully
//  ///      In case of huge gas cost use rebalance for each strategy separately
//  function rebalanceAll() external {
//    _onlyOperators();
//    require(_PAUSE_SLOT.getUint() == 0, "SS: Paused");
//    _NEED_REBALANCE_SLOT.set(uint(0));
//    // collect balances sum
//    uint _underlyingBalance = IERC20(_UNDERLYING_SLOT.getAddress()).balanceOf(address(this));
//    uint _strategiesBalancesSum = _underlyingBalance;
//    for (uint i = 0; i < strategies.length; i++) {
//      _strategiesBalancesSum += IStrategy(strategies[i]).investedUnderlyingBalance();
//    }
//    if (_strategiesBalancesSum == 0) {
//      return;
//    }
//    // rebalance only strategies requires withdraw
//    // it will move necessary amount to this contract
//    for (uint i = 0; i < strategies.length; i++) {
//      uint _ratio = strategiesRatios[strategies[i]] * _PRECISION;
//      if (_ratio == 0) {
//        continue;
//      }
//      uint _strategyBalance = IStrategy(strategies[i]).investedUnderlyingBalance();
//      uint _currentRatio = _strategyBalance * _PRECISION * STRATEGY_RATIO_DENOMINATOR / _strategiesBalancesSum;
//      if (_currentRatio > _ratio) {
//        // not necessary update underlying balance for withdraw
//        _rebalanceCall(strategies[i], _strategiesBalancesSum, _strategyBalance, _ratio);
//      }
//    }
//
//    // rebalance only strategies requires deposit
//    for (uint i = 0; i < strategies.length; i++) {
//      uint _ratio = strategiesRatios[strategies[i]] * _PRECISION;
//      if (_ratio == 0) {
//        continue;
//      }
//      uint _strategyBalance = IStrategy(strategies[i]).investedUnderlyingBalance();
//      uint _currentRatio = _strategyBalance * _PRECISION * STRATEGY_RATIO_DENOMINATOR / _strategiesBalancesSum;
//      if (_currentRatio < _ratio) {
//        _rebalanceCall(
//          strategies[i],
//          _strategiesBalancesSum,
//          _strategyBalance,
//          _ratio
//        );
//      }
//    }
//    emit RebalanceAll(_underlyingBalance, _strategiesBalancesSum);
//  }
//
//  /// @dev External function for calling rebalance for exact strategy
//  ///      Strategies that need withdraw action should be called first
//  function rebalance(address _strategy) external {
//    _onlyOperators();
//    require(_PAUSE_SLOT.getUint() == 0, "SS: Paused");
//    _NEED_REBALANCE_SLOT.set(uint(0));
//    _rebalance(_strategy);
//    emit Rebalance(_strategy);
//  }
//
//  /// @dev Deposit or withdraw from given strategy according the strategy ratio
//  ///      Should be called from EAO with multiple off-chain steps
//  function _rebalance(address _strategy) internal {
//    // normalize ratio to 18 decimals
//    uint _ratio = strategiesRatios[_strategy] * _PRECISION;
//    // in case of unknown strategy will be reverted here
//    require(_ratio != 0, "SS: Zero ratio strategy");
//    uint _strategyBalance;
//    uint _strategiesBalancesSum = IERC20(_UNDERLYING_SLOT.getAddress()).balanceOf(address(this));
//    // collect strategies balances sum with some tricks for gas optimisation
//    for (uint i = 0; i < strategies.length; i++) {
//      uint balance = IStrategy(strategies[i]).investedUnderlyingBalance();
//      if (strategies[i] == _strategy) {
//        _strategyBalance = balance;
//      }
//      _strategiesBalancesSum += balance;
//    }
//
//    _rebalanceCall(_strategy, _strategiesBalancesSum, _strategyBalance, _ratio);
//  }
//
//  ///@dev Deposit or withdraw from strategy
//  function _rebalanceCall(
//    address _strategy,
//    uint _strategiesBalancesSum,
//    uint _strategyBalance,
//    uint _ratio
//  ) internal {
//    address _underlying = _UNDERLYING_SLOT.getAddress();
//    uint _currentRatio = _strategyBalance * _PRECISION * STRATEGY_RATIO_DENOMINATOR / _strategiesBalancesSum;
//    if (_currentRatio < _ratio) {
//      // Need to deposit to the strategy.
//      // We are calling investAllUnderlying() because we anyway will spend similar gas
//      // in case of withdraw, and we can't predict what will need.
//      uint needToDeposit = _strategiesBalancesSum * (_ratio - _currentRatio) / (STRATEGY_RATIO_DENOMINATOR * _PRECISION);
//      uint _underlyingBalance = IERC20(_underlying).balanceOf(address(this));
//      needToDeposit = Math.min(needToDeposit, _underlyingBalance);
//      //      require(_underlyingBalance >= needToDeposit, "SS: Not enough splitter balance");
//      if (needToDeposit > _MIN_OP) {
//        IERC20(_underlying).safeTransfer(_strategy, needToDeposit);
//        IStrategy(_strategy).investAllUnderlying();
//      }
//    } else if (_currentRatio > _ratio) {
//      // withdraw from strategy excess value
//      uint needToWithdraw = _strategiesBalancesSum * (_currentRatio - _ratio) / (STRATEGY_RATIO_DENOMINATOR * _PRECISION);
//      needToWithdraw = Math.min(needToWithdraw, _strategyBalance);
//      //      require(_strategyBalance >= needToWithdraw, "SS: Not enough strat balance");
//      if (needToWithdraw > _MIN_OP) {
//        IStrategy(_strategy).withdrawToVault(needToWithdraw);
//      }
//    }
//  }
//
//  /// @dev Change rebalance marker
//  function setNeedRebalance(uint _value) external {
//    _onlyOperators();
//    require(_value < 2, "SS: Wrong value");
//    _NEED_REBALANCE_SLOT.set(_value);
//  }
//
//  /// @dev Stop deposit to strategies
//  function pauseInvesting() external override {
//    _restricted();
//    _PAUSE_SLOT.set(uint(1));
//  }
//
//  /// @dev Continue deposit to strategies
//  function continueInvesting() external override {
//    _restricted();
//    _PAUSE_SLOT.set(uint(0));
//  }
//
//  function transferAllUnderlyingToVault() internal {
//    address _underlying = _UNDERLYING_SLOT.getAddress();
//    uint balance = IERC20(_underlying).balanceOf(address(this));
//    if (balance > 0) {
//      IERC20(_underlying).safeTransfer(_VAULT_SLOT.getAddress(), balance);
//    }
//  }
//
//  // *********************************************
//  //                    VIEWS
//  // *********************************************
//
//  /// @dev Return array of reward tokens collected across all strategies.
//  ///      Has random sorting
//  function strategyRewardTokens() external view override returns (address[] memory) {
//    return _strategyRewardTokens();
//  }
//
//  function _isSplitter(address value) internal view returns (bool) {
//    try IStrategy(value).STRATEGY_NAME() returns (string memory name) {
//      return keccak256(bytes(name)) == keccak256(bytes(STRATEGY_NAME));
//    } catch {}
//    return false;
//  }
//
//  function _strategyRewardTokens() internal view returns (address[] memory) {
//    address[] memory rts = new address[](20);
//    uint size = 0;
//    uint length = strategies.length;
//    for (uint i = 0; i < length; i++) {
//      address strategy = strategies[i];
//      address[] memory strategyRts;
//      if (_isSplitter(strategy)) {
//        strategyRts = IStrategySplitter(strategy).strategyRewardTokens();
//      } else {
//        strategyRts = IStrategy(strategy).rewardTokens();
//      }
//      for (uint j = 0; j < strategyRts.length; j++) {
//        address rt = strategyRts[j];
//        bool exist = false;
//        for (uint k = 0; k < rts.length; k++) {
//          if (rts[k] == rt) {
//            exist = true;
//            break;
//          }
//        }
//        if (!exist) {
//          rts[size] = rt;
//          size++;
//        }
//      }
//    }
//    address[] memory result = new address[](size);
//    for (uint i = 0; i < size; i++) {
//      result[i] = rts[i];
//    }
//    return result;
//  }
//
//  /// @dev Underlying token. Should be the same for all controlled strategies
//  function underlying() external view override returns (address) {
//    return _UNDERLYING_SLOT.getAddress();
//  }
//
//  /// @dev Splitter underlying balance
//  function underlyingBalance() external view override returns (uint256){
//    return IERC20(_UNDERLYING_SLOT.getAddress()).balanceOf(address(this));
//  }
//
//  /// @dev Return strategies balances. Doesn't include splitter underlying balance
//  function rewardPoolBalance() external view override returns (uint256) {
//    uint balance;
//    for (uint i = 0; i < strategies.length; i++) {
//      balance += IStrategy(strategies[i]).investedUnderlyingBalance();
//    }
//    return balance;
//  }
//
//  /// @dev Return average buyback ratio
//  function buyBackRatio() external view override returns (uint256) {
//    uint bbRatio = 0;
//    for (uint i = 0; i < strategies.length; i++) {
//      bbRatio += IStrategy(strategies[i]).buyBackRatio();
//    }
//    bbRatio = bbRatio / strategies.length;
//    return bbRatio;
//  }
//
//  /// @dev Check unsalvageable tokens across all strategies
//  function unsalvageableTokens(address token) external view override returns (bool) {
//    for (uint i = 0; i < strategies.length; i++) {
//      if (IStrategy(strategies[i]).unsalvageableTokens(token)) {
//        return true;
//      }
//    }
//    return false;
//  }
//
//  /// @dev Connected vault to this splitter
//  function vault() external view override returns (address) {
//    return _VAULT_SLOT.getAddress();
//  }
//
//  /// @dev Return a sum of all balances under control. Should be accurate - it will be used in the vault
//  function investedUnderlyingBalance() external view override returns (uint256) {
//    return _investedUnderlyingBalance();
//  }
//
//  function _investedUnderlyingBalance() internal view returns (uint256) {
//    uint balance = IERC20(_UNDERLYING_SLOT.getAddress()).balanceOf(address(this));
//    for (uint i = 0; i < strategies.length; i++) {
//      balance += IStrategy(strategies[i]).investedUnderlyingBalance();
//    }
//    return balance;
//  }
//
//  /// @dev Splitter has specific hardcoded platform
//  function platform() external pure override returns (uint) {
//    return 24;
//  }
//
//  /// @dev Assume that we will use this contract only for single token vaults
//  function assets() external view override returns (address[] memory) {
//    address[] memory result = new address[](1);
//    result[0] = _UNDERLYING_SLOT.getAddress();
//    return result;
//  }
//
//  /// @dev todo
//  function rewardTokens() external pure override returns (address[] memory) {
//    return new address[](0);
//  }
//
//  /// @dev Paused investing in strategies
//  function pausedInvesting() external view override returns (bool) {
//    return _PAUSE_SLOT.getUint() == 1;
//  }
//
//  /// @dev Return ready to claim rewards array
//  function readyToClaim() external view override returns (uint256[] memory) {
//    uint[] memory rewards = new uint[](20);
//    address[] memory rts = new address[](20);
//    uint size = 0;
//    uint length = strategies.length;
//    for (uint i = 0; i < length; i++) {
//      address strategy = strategies[i];
//      address[] memory strategyRts;
//      if (_isSplitter(strategy)) {
//        strategyRts = IStrategySplitter(strategy).strategyRewardTokens();
//      } else {
//        strategyRts = IStrategy(strategy).rewardTokens();
//      }
//
//      uint[] memory strategyReadyToClaim = IStrategy(strategy).readyToClaim();
//      // don't count, better to skip than ruin
//      if (strategyRts.length != strategyReadyToClaim.length) {
//        continue;
//      }
//      for (uint j = 0; j < strategyRts.length; j++) {
//        address rt = strategyRts[j];
//        bool exist = false;
//        for (uint k = 0; k < rts.length; k++) {
//          if (rts[k] == rt) {
//            exist = true;
//            rewards[k] += strategyReadyToClaim[j];
//            break;
//          }
//        }
//        if (!exist) {
//          rts[size] = rt;
//          rewards[size] = strategyReadyToClaim[j];
//          size++;
//        }
//      }
//    }
//    uint[] memory result = new uint[](size);
//    for (uint i = 0; i < size; i++) {
//      result[i] = rewards[i];
//    }
//    return result;
//  }
//
//  /// @dev Return sum of strategies poolTotalAmount values
//  function poolTotalAmount() external view override returns (uint256) {
//    uint balance = 0;
//    for (uint i = 0; i < strategies.length; i++) {
//      balance += IStrategy(strategies[i]).poolTotalAmount();
//    }
//    return balance;
//  }
//
//  /// @dev Positive value indicate that this splitter should be rebalanced.
//  function needRebalance() external view override returns (uint) {
//    return _NEED_REBALANCE_SLOT.getUint();
//  }
//
//  /// @dev Sum of users requested values
//  function wantToWithdraw() external view override returns (uint) {
//    return _WANT_WITHDRAW_SLOT.getUint();
//  }
//
//  /// @dev Return maximum available balance to withdraw without calling more than 1 strategy
//  function maxCheapWithdraw() external view override returns (uint) {
//    address _underlying = _UNDERLYING_SLOT.getAddress();
//    uint strategyBalance;
//    if (strategies.length != 0) {
//      address firstStrategy = strategies[0];
//      if (_isSplitter(firstStrategy)) {
//        strategyBalance = IStrategySplitter(firstStrategy).maxCheapWithdraw();
//      } else {
//        strategyBalance = IStrategy(firstStrategy).investedUnderlyingBalance();
//      }
//    }
//    return strategyBalance
//    + IERC20(_underlying).balanceOf(address(this))
//    + IERC20(_underlying).balanceOf(_VAULT_SLOT.getAddress());
//  }
//
//  /// @dev Length of strategy array
//  function strategiesLength() external view override returns (uint) {
//    return strategies.length;
//  }
//
//  /// @dev Returns strategy array
//  function allStrategies() external view override returns (address[] memory) {
//    return strategies;
//  }
//
//  /// @dev Return true if given item found in address array
//  function _contains(address[] memory array, address _item) internal pure returns (bool) {
//    for (uint256 i = 0; i < array.length; i++) {
//      if (array[i] == _item) return true;
//    }
//    return false;
//  }
//
//}
