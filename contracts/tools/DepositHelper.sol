// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../interfaces/IERC4626.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IVeTetu.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../interfaces/IBVault.sol";

contract DepositHelper is ReentrancyGuard {
  using SafeERC20 for IERC20;

  address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  bytes32 public constant BALANCER_POOL_ID = 0xe2f706ef1f7240b803aae877c9c762644bb808d80002000000000000000008c2; // poolId of 80TETU-20USDC
  address public constant BALANCER_POOL_TOKEN = 0xE2f706EF1f7240b803AAe877C9C762644bb808d8; // 80TETU-20USDC
  address public constant ASSET0 = 0x255707B70BF90aa112006E1b07B9AeA6De021424; // TETU
  address public constant ASSET1 = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174; // USDC
  address public immutable oneInchRouter;

  constructor(address _oneInchRouter) {
    require(_oneInchRouter != address(0), "WRONG_INPUT");
    oneInchRouter = _oneInchRouter;
  }

  /// @dev Proxy deposit action for keep approves on this contract
  function deposit(address vault, address asset, uint amount, uint minSharesOut) public nonReentrant returns (uint) {
    IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    _approveIfNeeds(asset, amount, vault);
    uint sharesOut = IERC4626(vault).deposit(amount, msg.sender);
    require(sharesOut >= minSharesOut, "SLIPPAGE");

    _sendRemainingToken(asset);
    return sharesOut;
  }

  function withdraw(
    address vault,
    uint shareAmount,
    uint minAmountOut
  ) external nonReentrant returns (uint) {
    uint amountOut = IERC4626(vault).redeem(shareAmount, msg.sender, msg.sender);
    require(amountOut >= minAmountOut, "SLIPPAGE");

    _sendRemainingToken(vault);
    return amountOut;
  }

  /// @dev Convert input token to output token and deposit.
  ///      tokenOut should be vault asset
  function convertAndDeposit(
    bytes memory swapData,
    address tokenIn,
    uint amountIn,
    address vault,
    uint minSharesOut
  ) external nonReentrant returns (uint) {
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

    _approveIfNeeds(tokenIn, amountIn, oneInchRouter);
    (bool success,bytes memory result) = oneInchRouter.call(swapData);
    require(success, string(result));

    address asset = address(IERC4626(vault).asset());
    uint balance = IERC20(asset).balanceOf(address(this));

    require(balance != 0, "Zero result balance");
    _approveIfNeeds(asset, balance, vault);
    uint sharesOut = IERC4626(vault).deposit(balance, msg.sender);
    require(sharesOut >= minSharesOut, "SLIPPAGE");

    _sendRemainingToken(tokenIn);
    _sendRemainingToken(asset);
    return sharesOut;
  }

  /// @dev Withdraw from given vault and convert assets to tokenOut
  ///      tokenIn should be vault asset
  function withdrawAndConvert(
    address vault,
    uint shareAmount,
    bytes memory swapData,
    address tokenOut,
    uint minAmountOut
  ) external nonReentrant returns (uint) {
    uint amountIn = IERC4626(vault).redeem(shareAmount, address(this), msg.sender);

    address asset = address(IERC4626(vault).asset());
    _approveIfNeeds(asset, amountIn, oneInchRouter);
    (bool success,) = oneInchRouter.call(swapData);
    require(success, "Swap error");

    uint balance = IERC20(tokenOut).balanceOf(address(this));
    require(balance != 0, "Zero result balance");
    require(balance >= minAmountOut, "SLIPPAGE");
    IERC20(tokenOut).safeTransfer(msg.sender, balance);

    _sendRemainingToken(vault);
    _sendRemainingToken(asset);
    return balance;
  }

  function convertAndCreateLock(
    bytes memory asset0SwapData,
    bytes memory asset1SwapData,
    address tokenIn,
    uint amountIn,
    IVeTetu ve,
    uint lockDuration
  ) external nonReentrant returns (
    uint tokenId,
    uint lockedAmount,
    uint power,
    uint unlockDate
  ) {
    uint bptBalance = convertToTetuBalancerPoolToken(
      asset0SwapData,
      asset1SwapData,
      tokenIn,
      amountIn,
      ASSET0,
      ASSET1
    );

    _approveIfNeeds(BALANCER_POOL_TOKEN, bptBalance, address(ve));
    tokenId = ve.createLockFor(BALANCER_POOL_TOKEN, bptBalance, lockDuration, msg.sender);

    lockedAmount = ve.lockedAmounts(tokenId, BALANCER_POOL_TOKEN);
    power = ve.balanceOfNFT(tokenId);
    unlockDate = ve.lockedEnd(tokenId);

    _sendRemainingToken(BALANCER_POOL_TOKEN);
  }

  function createLock(IVeTetu ve, address token, uint value, uint lockDuration) external nonReentrant returns (
    uint tokenId,
    uint lockedAmount,
    uint power,
    uint unlockDate
  ) {
    IERC20(token).safeTransferFrom(msg.sender, address(this), value);
    _approveIfNeeds(token, value, address(ve));
    tokenId = ve.createLockFor(token, value, lockDuration, msg.sender);

    lockedAmount = ve.lockedAmounts(tokenId, token);
    power = ve.balanceOfNFT(tokenId);
    unlockDate = ve.lockedEnd(tokenId);

    _sendRemainingToken(token);
  }

  function convertAndIncreaseAmount(
    bytes memory asset0SwapData,
    bytes memory asset1SwapData,
    address tokenIn,
    uint amountIn,
    IVeTetu ve,
    uint tokenId
  ) external nonReentrant returns (
    uint lockedAmount,
    uint power,
    uint unlockDate,
    uint bptBalance
  ) {
    bptBalance = convertToTetuBalancerPoolToken(
      asset0SwapData,
      asset1SwapData,
      tokenIn,
      amountIn,
      ASSET0,
      ASSET1
    );

    _approveIfNeeds(BALANCER_POOL_TOKEN, bptBalance, address(ve));
    ve.increaseAmount(BALANCER_POOL_TOKEN, tokenId, bptBalance);

    lockedAmount = ve.lockedAmounts(tokenId, BALANCER_POOL_TOKEN);
    power = ve.balanceOfNFT(tokenId);
    unlockDate = ve.lockedEnd(tokenId);

    _sendRemainingToken(BALANCER_POOL_TOKEN);
  }

  function increaseAmount(IVeTetu ve, address token, uint tokenId, uint value) external nonReentrant returns (
    uint lockedAmount,
    uint power,
    uint unlockDate
  ) {
    IERC20(token).safeTransferFrom(msg.sender, address(this), value);
    _approveIfNeeds(token, value, address(ve));
    ve.increaseAmount(token, tokenId, value);

    lockedAmount = ve.lockedAmounts(tokenId, token);
    power = ve.balanceOfNFT(tokenId);
    unlockDate = ve.lockedEnd(tokenId);

    _sendRemainingToken(token);
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

  function convertToTetuBalancerPoolToken(
    bytes memory asset0SwapData,
    bytes memory asset1SwapData,
    address tokenIn,
    uint amountIn,
    address asset0,
    address asset1
  ) internal returns (uint bptBalance){
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

    _approveIfNeeds(tokenIn, amountIn, oneInchRouter);
    if (tokenIn != asset0) {
      (bool success,bytes memory result) = oneInchRouter.call(asset0SwapData);
      require(success, string(result));
    }

    if (tokenIn != asset1) {
      (bool success,bytes memory result) = oneInchRouter.call(asset1SwapData);
      require(success, string(result));
    }

    // add liquidity
    joinBalancerPool(BALANCER_VAULT, BALANCER_POOL_ID, ASSET0, ASSET1, IERC20(ASSET0).balanceOf(address(this)), IERC20(ASSET1).balanceOf(address(this)));

    _sendRemainingToken(tokenIn);
    _sendRemainingToken(ASSET0);
    _sendRemainingToken(ASSET1);
    return IERC20(BALANCER_POOL_TOKEN).balanceOf(address(this));
  }

  function joinBalancerPool(address _bVault, bytes32 _poolId, address _token0, address _token1, uint _amount0, uint _amount1) internal {
    require(_amount0 != 0 || _amount1 != 0, "ZC: zero amounts");

    _approveIfNeeds(_token0, _amount0, _bVault);
    _approveIfNeeds(_token1, _amount1, _bVault);

    IAsset[] memory _poolTokens = new IAsset[](2);
    _poolTokens[0] = IAsset(_token0);
    _poolTokens[1] = IAsset(_token1);

    uint[] memory amounts = new uint[](2);
    amounts[0] = _amount0;
    amounts[1] = _amount1;

    IBVault(_bVault).joinPool(
      _poolId,
      address(this),
      address(this),
      IBVault.JoinPoolRequest({
        assets: _poolTokens,
        maxAmountsIn: amounts,
        userData: abi.encode(1, amounts, 1),
        fromInternalBalance: false
      })
    );
  }

  function _sendRemainingToken(address token) internal {
    uint balance = IERC20(token).balanceOf(address(this));
    if (balance != 0) {
      IERC20(token).safeTransfer(msg.sender, balance);
    }
  }
}
