// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/Math.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/ISplitter.sol";
import "../interfaces/IForwarder.sol";
import "../interfaces/ITetuVaultV2.sol";
import "../proxy/ControllableV3.sol";

/// @title Abstract contract for base strategy functionality
/// @author belbix
abstract contract StrategyBaseV2 is IStrategyV2, ControllableV3 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant STRATEGY_BASE_VERSION = "2.0.3";
  /// @dev Denominator for compound ratio
  uint internal constant COMPOUND_DENOMINATOR = 100_000;
  /// @dev Denominator for fee calculation.
  uint internal constant FEE_DENOMINATOR = 100_000;

  // *************************************************************
  //                        ERRORS
  // *************************************************************

  string internal constant WRONG_CONTROLLER = "SB: Wrong controller";
  string internal constant DENIED = "SB: Denied";
  string internal constant TOO_HIGH = "SB: Too high";
  string internal constant IMPACT_TOO_HIGH = "SB: Impact too high";
  string internal constant WRONG_AMOUNT = "SB: Wrong amount";

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
  /// @notice Balances of not-reward amounts
  /// @dev Any amounts transferred to the strategy for investing or withdrawn back are registered here
  ///      As result it's possible to distinct invested amounts from rewards, airdrops and other profits
  mapping(address => uint) public baseAmounts;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event WithdrawAllToSplitter(uint amount);
  event WithdrawToSplitter(uint amount, uint sent, uint balance);
  event EmergencyExit(address sender, uint amount);
  event ManualClaim(address sender);
  event InvestAll(uint balance);
  event DepositToPool(uint amount);
  event WithdrawFromPool(uint amount);
  event WithdrawAllFromPool(uint amount);
  event Claimed(address token, uint amount);
  event CompoundRatioChanged(uint oldValue, uint newValue);
  /// @notice {baseAmounts} of {asset} is changed on the {amount} value
  event UpdateBaseAmounts(address asset, int amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @notice Initialize contract after setup it as proxy implementation
  function __StrategyBase_init(
    address controller_,
    address _splitter
  ) public onlyInitializing {
    _requireInterface(_splitter, InterfaceIds.I_SPLITTER);
    __Controllable_init(controller_);

    require(IControllable(_splitter).isController(controller_), WRONG_CONTROLLER);

    asset = ISplitter(_splitter).asset();
    splitter = _splitter;
  }

  // *************************************************************
  //                     RESTRICTIONS
  // *************************************************************

  /// @dev Restrict access only for operators
  function _onlyOperators() internal view {
    require(IController(controller()).isOperator(msg.sender), DENIED);
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
    require(msg.sender == IController(controller()).platformVoter(), DENIED);
    require(value <= COMPOUND_DENOMINATOR, TOO_HIGH);
    emit CompoundRatioChanged(compoundRatio, value);
    compoundRatio = value;
  }

  // *************************************************************
  //                   OPERATOR ACTIONS
  // *************************************************************

  /// @dev In case of any issue operator can withdraw all from pool.
  function emergencyExit() external {
    _onlyOperators();

    _emergencyExitFromPool();

    address _asset = asset; // gas saving
    uint balance = IERC20(_asset).balanceOf(address(this));
    _decreaseBaseAmount(_asset, baseAmounts[_asset]); // reset base amount
    IERC20(_asset).safeTransfer(splitter, balance);
    emit EmergencyExit(msg.sender, balance);
  }

  /// @dev Manual claim rewards.
  function claim() external {
    _onlyOperators();

    _claim();
    emit ManualClaim(msg.sender);
  }

  // *************************************************************
  //                    DEPOSIT/WITHDRAW
  // *************************************************************

  /// @notice Stakes everything the strategy holds into the reward pool.
  /// @param amount_ Amount transferred to the strategy balance just before calling this function
  /// @param updateTotalAssetsBeforeInvest_ Recalculate total assets amount before depositing.
  ///                                       It can be false if we know exactly, that the amount is already actual.
  /// @return totalAssetsDelta The {strategy} can update its totalAssets amount internally before depositing {amount_}
  ///                          Return [totalAssets-before-deposit - totalAssets-before-call-of-investAll]
  function investAll(
    uint amount_,
    bool updateTotalAssetsBeforeInvest_
  ) external override returns (
    int totalAssetsDelta
  ) {
    require(msg.sender == splitter, DENIED);

    address _asset = asset; // gas saving
    uint balance = IERC20(_asset).balanceOf(address(this));

    _increaseBaseAmount(_asset, amount_, balance);

    if (balance > 0) {
      totalAssetsDelta = _depositToPool(balance, updateTotalAssetsBeforeInvest_);
    }
    emit InvestAll(balance);

    return totalAssetsDelta;
  }

  /// @dev Withdraws all underlying assets to the vault
  /// @return Return [totalAssets-before-withdraw - totalAssets-before-call-of-withdrawAllToSplitter]
  function withdrawAllToSplitter() external override returns (int) {
    address _splitter = splitter;
    address _asset = asset; // gas saving
    require(msg.sender == _splitter, DENIED);

    uint balance = IERC20(_asset).balanceOf(address(this));

    (uint investedAssetsUSD, uint assetPrice, int totalAssetsDelta) = _withdrawAllFromPool();

    balance = _checkWithdrawImpact(
      _asset,
      balance,
      investedAssetsUSD,
      assetPrice,
      _splitter
    );

    {
      // we cannot withdraw more than the base amount value
      // if any additional amount exist on the balance (i.e. airdrops)
      // it should be processed by hardwork at first (split on compound/forwarder)
      uint baseAmount = baseAmounts[_asset];
      if (balance > baseAmount) {
        balance = baseAmount;
      }
    }

    if (balance != 0) {
      _decreaseBaseAmount(_asset, balance);
      IERC20(_asset).safeTransfer(_splitter, balance);
    }
    emit WithdrawAllToSplitter(balance);

    return totalAssetsDelta;
  }

  /// @dev Withdraws some assets to the splitter
  /// @return totalAssetsDelta =[totalAssets-before-withdraw - totalAssets-before-call-of-withdrawAllToSplitter]
  function withdrawToSplitter(uint amount) external override returns (int totalAssetsDelta) {
    address _splitter = splitter;
    address _asset = asset; // gas saving
    require(msg.sender == _splitter, DENIED);

    uint balance = IERC20(_asset).balanceOf(address(this));
    if (amount > balance) {
      uint investedAssetsUSD;
      uint assetPrice;

      (investedAssetsUSD, assetPrice, totalAssetsDelta) = _withdrawFromPool(amount - balance);
      balance = _checkWithdrawImpact(
        _asset,
        balance,
        investedAssetsUSD,
        assetPrice,
        _splitter
      );
    }

    uint amountAdjusted = Math.min(amount, balance);
    if (amountAdjusted != 0) {
      _decreaseBaseAmount(_asset, amountAdjusted);
      IERC20(_asset).safeTransfer(_splitter, amountAdjusted);
    }
    emit WithdrawToSplitter(amount, amountAdjusted, balance);

    return totalAssetsDelta;
  }


  // *************************************************************
  //                  baseAmounts modifications
  // *************************************************************

  /// @notice Decrease {baseAmounts} of the {asset} on {amount_}
  ///         The {amount_} can be greater then total base amount value because it can includes rewards.
  ///         We assume here, that base amounts are spent first, then rewards and any other profit-amounts
  function _decreaseBaseAmount(address asset_, uint amount_) internal {
    uint baseAmount = baseAmounts[asset_];
    require(baseAmount >= amount_, WRONG_AMOUNT);
    baseAmounts[asset_] = baseAmount - amount_;
    emit UpdateBaseAmounts(asset_, -int(baseAmount));
  }

  /// @notice Increase {baseAmounts} of the {asset} on {amount_}, ensure that current {assetBalance_} >= {amount_}
  /// @param assetBalance_ Current balance of the {asset} to check if {amount_} > the balance. Pass 0 to skip the check
  function _increaseBaseAmount(address asset_, uint amount_, uint assetBalance_) internal {
    baseAmounts[asset_] += amount_;
    emit UpdateBaseAmounts(asset_, int(amount_));
    require(assetBalance_ >= amount_, WRONG_AMOUNT);
  }

  // *************************************************************
  //                       HELPERS
  // *************************************************************

  /// @notice Calculate withdrawn amount in USD using the {assetPrice}.
  ///         Revert if the amount is different from expected too much (high price impact)
  /// @param balanceBefore Asset balance of the strategy before withdrawing
  /// @param investedAssetsUSD Expected amount in USD, decimals are same to {_asset}
  /// @param assetPrice Price of the asset, decimals 18
  /// @return balance Current asset balance of the strategy
  function _checkWithdrawImpact(
    address _asset,
    uint balanceBefore,
    uint investedAssetsUSD,
    uint assetPrice,
    address _splitter
  ) internal view returns (uint balance) {
    balance = IERC20(_asset).balanceOf(address(this));
    if (assetPrice != 0 && investedAssetsUSD != 0) {

      uint withdrew = balance > balanceBefore ? balance - balanceBefore : 0;
      uint withdrewUSD = withdrew * assetPrice / 1e18;
      uint priceChangeTolerance = ITetuVaultV2(ISplitter(_splitter).vault()).withdrawFee();
      uint difference = investedAssetsUSD > withdrewUSD ? investedAssetsUSD - withdrewUSD : 0;

      require(difference * FEE_DENOMINATOR / investedAssetsUSD <= priceChangeTolerance, IMPACT_TOO_HIGH);
    }
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
  /// @return totalAssetsDelta The {strategy} can update its totalAssets amount internally before depositing {amount_}
  ///                          Return [totalAssets-before-deposit - totalAssets-before-call-of-investAll]
  function _depositToPool(
    uint amount,
    bool updateTotalAssetsBeforeInvest_
  ) internal virtual returns (
    int totalAssetsDelta
  );

  /// @dev Withdraw given amount from the pool.
  /// @return investedAssetsUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  /// @return totalAssetsDelta The {strategy} can update its totalAssets amount internally before withdrawing
  ///                          Return [totalAssets-before-withdraw - totalAssets-before-call-of-_withdrawFromPool]
  function _withdrawFromPool(uint amount) internal virtual returns (
    uint investedAssetsUSD,
    uint assetPrice,
    int totalAssetsDelta
  );

  /// @dev Withdraw all from the pool.
  /// @return investedAssetsUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  /// @return totalAssetsDelta The {strategy} can update its totalAssets amount internally before withdrawing
  ///                          Return [totalAssets-before-withdraw - totalAssets-before-call-of-_withdrawAllFromPool]
  function _withdrawAllFromPool() internal virtual returns (
    uint investedAssetsUSD,
    uint assetPrice,
    int totalAssetsDelta
  );

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  ///      Withdraw assets without impact checking.
  function _emergencyExitFromPool() internal virtual;

  /// @dev Claim all possible rewards.
  function _claim() internal virtual;

}
