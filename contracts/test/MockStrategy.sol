// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../strategy/StrategyBaseV2.sol";
import "./MockPool.sol";
import "./MockToken.sol";

contract MockStrategy is StrategyBaseV2 {

  string public constant override NAME = "mock strategy";
  string public constant override PLATFORM = "test";
  string public constant override STRATEGY_VERSION = "1.0.0";

  bool public override isReadyToHardWork;

  uint internal slippage;
  uint internal slippageDeposit;
  uint internal hardWorkSlippage;
  uint internal lastEarned;
  uint internal lastLost;
  uint internal _capacity;
  int internal _totalAssetsDelta;

  MockPool public pool;

  function init(
    address controller_,
    address _splitter
  ) external initializer {
    __StrategyBase_init(controller_, _splitter);
    splitter = _splitter;
    isReadyToHardWork = true;
    _capacity = type(uint).max; // unlimited capacity by default
    pool = new MockPool();
  }

  function doHardWork() external override returns (uint earned, uint lost) {
    pool.withdraw(asset, investedAssets());
    uint _slippage = IERC20(asset).balanceOf(address(this)) * hardWorkSlippage / 100_000;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }
    if (lastEarned != 0) {
      uint toCompound = lastEarned * compoundRatio / COMPOUND_DENOMINATOR;
      MockToken(asset).mint(address(this), toCompound);
      address forwarder = IController(controller()).forwarder();
      if (forwarder != address(0)) {
        MockToken(asset).mint(address(this), lastEarned - toCompound);

        address[] memory tokens = new address[](1);
        tokens[0] = asset;
        uint[] memory amounts = new uint[](1);
        amounts[0] = lastEarned - toCompound;
        IForwarder(forwarder).registerIncome(tokens, amounts, ISplitter(splitter).vault(), true);
      }
    }
    IERC20(asset).transfer(address(pool), IERC20(asset).balanceOf(address(this)));
    return (lastEarned, Math.max(lastLost, _slippage));
  }

  /// @dev Amount of underlying assets invested to the pool.
  function investedAssets() public view override returns (uint) {
    return IERC20(asset).balanceOf(address(pool));
  }

  /// @dev Deposit given amount to the pool.
  function _depositToPool(
    uint amount,
    bool /*updateTotalAssetsBeforeInvest_*/
  ) internal override returns (
    uint strategyLoss
  ) {
    uint _slippage = amount * slippageDeposit / 100_000;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }
    if (amount - _slippage != 0) {
      IERC20(asset).transfer(address(pool), amount - _slippage);
    }

    return _slippage;
  }

  /// @dev Withdraw given amount from the pool.
  function _withdrawFromPool(uint amount) internal override returns (
    uint expectedWithdrewUSD,
    uint assetPrice,
    uint strategyLoss
  ) {
    assetPrice = 1e18;
    expectedWithdrewUSD = amount;

    pool.withdraw(asset, amount);
    uint _slippage = amount * slippage / 100_000;
    strategyLoss = _slippage;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }
  }

  /// @dev Withdraw all from the pool.
  function _withdrawAllFromPool() internal override returns (
    uint expectedWithdrewUSD,
    uint assetPrice,
    uint strategyLoss
  ) {
    assetPrice = 1e18;
    expectedWithdrewUSD = 0; // investedAssets();

    pool.withdraw(asset, investedAssets());
    uint _slippage = totalAssets() * slippage / 100_000;
    if (_slippage != 0) {
      IERC20(asset).transfer(controller(), _slippage);
    }

    return (expectedWithdrewUSD, assetPrice, _slippage);
  }

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  function _emergencyExitFromPool() internal override {
    pool.withdraw(asset, investedAssets());
  }

  /// @dev Claim all possible rewards.
  function _claim() internal override {
    // noop
  }

  function setLast(uint earned, uint lost) external {
    lastEarned = earned;
    lastLost = lost;
  }

  function setSlippage(uint value) external {
    slippage = value;
  }

  function setSlippageDeposit(uint value) external {
    slippageDeposit = value;
  }

  function setSlippageHardWork(uint value) external {
    hardWorkSlippage = value;
  }

  function setReady(bool value) external {
    isReadyToHardWork = value;
  }

  function setCompoundRatioManual(uint ratio) external {
    compoundRatio = ratio;
  }

  /// @notice Max amount that can be deposited to the strategy, see SCB-593
  function capacity() external view override returns (uint) {
    return _capacity;
  }

  function setCapacity(uint capacity_) external {
    _capacity = capacity_;
  }

  function setTotalAssetsDelta(int totalAssetsDelta_) external {
    _totalAssetsDelta = totalAssetsDelta_;
  }


  ////////////////////////////////////////////////////////
  ///           Access to internal functions
  ////////////////////////////////////////////////////////
  function checkWithdrawImpactAccessForTests(
    address _asset,
    uint balanceBefore,
    uint investedAssetsUSD,
    uint assetPrice,
    address _splitter
  ) external view returns (uint balance) {
    return StrategyLib.checkWithdrawImpact(_asset, balanceBefore, investedAssetsUSD, assetPrice, _splitter);
  }
}
