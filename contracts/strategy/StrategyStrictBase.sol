// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/Math.sol";
import "../interfaces/IStrategyV2.sol";
import "../interfaces/IForwarder.sol";
import "../interfaces/IERC4626.sol";
import "../interfaces/IStrategyStrict.sol";
import "../tools/TetuERC165.sol";

/// @title Abstract contract for base strict strategy functionality
/// @author AlehNat
abstract contract StrategyStrictBase is IStrategyStrict, TetuERC165 {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant STRICT_STRATEGY_BASE_VERSION = "1.0.0";

  // *************************************************************
  //                        ERRORS
  // *************************************************************

  string internal constant WRONG_CONTROLLER = "SB: Wrong controller";
  string internal constant DENIED = "SB: Denied";
  string internal constant TOO_HIGH = "SB: Too high";
  string internal constant IMPACT_TOO_HIGH = "SB: Impact too high";
  string internal constant WRONG_AMOUNT = "SB: Wrong amount";
  string internal constant ALREADY_INITIALIZED = "SB: Already initialized";

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev Underlying asset
  address public override asset;
  /// @dev Linked vault
  address public override vault;
  /// @dev Percent of profit for autocompound inside this strategy.
  uint public override compoundRatio;
  /// @notice Balances of not-reward amounts
  /// @dev Any amounts transferred to the strategy for investing or withdrawn back are registered here
  ///      As result it's possible to distinct invested amounts from rewards, airdrops and other profits
  mapping(address => uint) public baseAmounts;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event WithdrawAllToVault(uint amount);
  event WithdrawToVault(uint amount, uint sent, uint balance);
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

  /// @dev Initialize with the vault. Can be called only once.
  function init(address _vault) external {
    require(vault == address(0), ALREADY_INITIALIZED);
    _requireInterface(_vault, InterfaceIds.I_ERC4626);
    asset = IERC4626(_vault).asset();
    vault = _vault;
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
    return interfaceId == InterfaceIds.I_STRATEGY_STRICT || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                    DEPOSIT/WITHDRAW
  // *************************************************************

  /// @dev Stakes everything the strategy holds into the reward pool.
  function investAll() external override {
    require(msg.sender == vault, DENIED);
    address _asset = asset; // gas saving
    uint balance = IERC20(_asset).balanceOf(address(this));
    if (balance > 0) {
      _depositToPool(balance);
    }
    emit InvestAll(balance);
  }

  /// @dev Withdraws all underlying assets to the vault
  function withdrawAllToVault() external override {
    address _vault = vault;
    address _asset = asset; // gas saving
    require(msg.sender == _vault, DENIED);
    _withdrawAllFromPool();
    uint balance = IERC20(_asset).balanceOf(address(this));
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
      IERC20(_asset).safeTransfer(_vault, balance);
    }
    emit WithdrawAllToVault(balance);
  }

  /// @dev Withdraws some assets to the vault
  function withdrawToVault(uint amount) external override {
    address _vault = vault;
    address _asset = asset; // gas saving
    require(msg.sender == _vault, DENIED);
    uint balance = IERC20(_asset).balanceOf(address(this));
    if (amount > balance) {
      _withdrawFromPool(amount - balance);
      balance = IERC20(_asset).balanceOf(address(this));
    }

    uint amountAdjusted = Math.min(amount, balance);
    if (amountAdjusted != 0) {
      IERC20(_asset).safeTransfer(_vault, amountAdjusted);
    }
    emit WithdrawToVault(amount, amountAdjusted, balance);
  }

  // *************************************************************
  //                       VIRTUAL
  // These functions must be implemented in the strategy contract
  // *************************************************************

  /// @dev Amount of underlying assets invested to the pool.
  function investedAssets() public view virtual returns (uint);

  /// @dev Deposit given amount to the pool.
  function _depositToPool(uint amount) internal virtual;

  /// @dev Withdraw given amount from the pool.
  /// @return investedAssetsUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  function _withdrawFromPool(uint amount) internal virtual returns (uint investedAssetsUSD, uint assetPrice);

  /// @dev Withdraw all from the pool.
  /// @return investedAssetsUSD Sum of USD value of each asset in the pool that was withdrawn, decimals of {asset}.
  /// @return assetPrice Price of the strategy {asset}.
  function _withdrawAllFromPool() internal virtual returns (uint investedAssetsUSD, uint assetPrice);

  /// @dev If pool support emergency withdraw need to call it for emergencyExit()
  ///      Withdraw assets without impact checking.
  function _emergencyExitFromPool() internal virtual;

  /// @dev Claim all possible rewards.
  function _claim() internal virtual;

}
