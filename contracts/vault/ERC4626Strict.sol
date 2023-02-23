// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./ERC4626.sol";
import "../interfaces/IStrategyStrict.sol";
import "../tools/TetuERC165.sol";

contract ERC4626Strict is ERC4626, TetuERC165 {
  using SafeERC20 for IERC20;
  using FixedPointMathLib for uint;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VAULT_VERSION = "1.0.0";
  /// @dev Denominator for buffer calculation. 100% of the buffer amount.
  uint constant public BUFFER_DENOMINATOR = 100_000;

  // *************************************************************
  //                        VARIABLES
  // *************************************************************

  /// @dev Connected strategy. Can not be changed.
  IStrategyStrict public immutable strategy;
  /// @dev Percent of assets that will always stay in this vault.
  uint public immutable buffer;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Invest(address splitter, uint amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  constructor(
    IERC20 asset_,
    string memory _name,
    string memory _symbol,
    address _strategy,
    uint _buffer
  ) ERC4626(asset_, _name, _symbol){
    // buffer is 5% max
    require(_buffer <= BUFFER_DENOMINATOR / 20, "!BUFFER");
    _requireERC20(address(asset_));
    buffer = _buffer;
    _requireInterface(_strategy, InterfaceIds.I_STRATEGY_STRICT);
    strategy = IStrategyStrict(_strategy);
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev Total amount of the underlying asset that is “managed” by Vault
  function totalAssets() public view override returns (uint) {
    return _asset.balanceOf(address(this)) + strategy.totalAssets();
  }

  /// @dev Amount of assets under control of strategy.
  function strategyAssets() external view returns (uint) {
    return strategy.totalAssets();
  }

  /// @dev Price of 1 full share
  function sharePrice() external view returns (uint) {
    uint units = 10 ** uint256(decimals());
    uint totalSupply_ = totalSupply();
    return totalSupply_ == 0
    ? units
    : units * totalAssets() / totalSupply_;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == InterfaceIds.I_ERC4626 || super.supportsInterface(interfaceId);
  }

  // *************************************************************
  //                 DEPOSIT LOGIC
  // *************************************************************

  /// @dev Calculate available to invest amount and send this amount to strategy
  function afterDeposit(uint /*assets*/, uint /*shares*/) internal override {
    IStrategyStrict _strategy = strategy;
    IERC20 asset_ = _asset;

    uint256 toInvest = _availableToInvest(_strategy, asset_);
    // invest only when buffer is filled
    if (toInvest > 0) {
      asset_.safeTransfer(address(_strategy), toInvest);
      _strategy.investAll(toInvest);
      emit Invest(address(_strategy), toInvest);
    }
  }

  /// @notice Returns amount of assets ready to invest to the strategy
  function _availableToInvest(IStrategyStrict _strategy, IERC20 asset_) internal view returns (uint) {
    uint _buffer = buffer;
    uint assetsInVault = asset_.balanceOf(address(this));
    uint assetsInStrategy = _strategy.totalAssets();
    uint wantInvestTotal = (assetsInVault + assetsInStrategy)
    * (BUFFER_DENOMINATOR - _buffer) / BUFFER_DENOMINATOR;
    if (assetsInStrategy >= wantInvestTotal) {
      return 0;
    } else {
      uint remainingToInvest = wantInvestTotal - assetsInStrategy;
      return remainingToInvest <= assetsInVault ? remainingToInvest : assetsInVault;
    }
  }


  // *************************************************************
  //                 WITHDRAW LOGIC
  // *************************************************************

  /// @dev Withdraw all available shares for tx sender.
  ///      The revert is expected if the balance is higher than `maxRedeem`
  ///      It suppose to be used only on UI - for on-chain interactions withdraw concrete amount with properly checks.
  function withdrawAll() external {
    redeem(balanceOf(msg.sender), msg.sender, msg.sender);
  }

  /// @dev Internal hook for getting necessary assets from strategy.
  function beforeWithdraw(uint assets, uint shares) internal override {
    uint balance = _asset.balanceOf(address(this));
    // if not enough balance in the vault withdraw from strategies
    if (balance < assets) {
      _processWithdrawFromStrategy(
        assets,
        shares,
        totalSupply(),
        buffer,
        strategy,
        balance
      );
    }
  }

  /// @dev Do necessary calculation for withdrawing from strategy and move assets to vault.
  function _processWithdrawFromStrategy(
    uint assetsNeed,
    uint shares,
    uint totalSupply_,
    uint _buffer,
    IStrategyStrict _strategy,
    uint assetsInVault
  ) internal {
    // withdraw everything from the strategy to accurately check the share value
    if (shares == totalSupply_) {
      _strategy.withdrawAllToVault();
    } else {
      uint assetsInStrategy = _strategy.totalAssets();

      // we should always have buffer amount inside the vault
      // assume `assetsNeed` can not be higher than entire balance
      uint expectedBuffer = (assetsInStrategy + assetsInVault - assetsNeed) * _buffer / BUFFER_DENOMINATOR;

      // this code should not be called if `assetsInVault` higher than `assetsNeed`
      uint missing = Math.min(expectedBuffer + assetsNeed - assetsInVault, assetsInStrategy);
      // if zero should be resolved on strategy side
      _strategy.withdrawToVault(missing);
    }
  }

}
