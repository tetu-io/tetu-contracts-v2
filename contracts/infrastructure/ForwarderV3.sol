// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../interfaces/ITetuLiquidator.sol";
import "../interfaces/IVoter.sol";
import "../interfaces/IVeDistributor.sol";
import "../interfaces/IForwarder.sol";
import "../proxy/ControllableV3.sol";

/// @title This contract should contains a buffer of fees from strategies.
///        Periodically sell rewards and distribute to their destinations.
/// @author belbix
contract ForwarderV3 is ReentrancyGuard, ControllableV3, IForwarder {
  using SafeERC20 for IERC20;

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant FORWARDER_VERSION = "3.0.0";
  /// @dev Denominator for different ratios. It is default for the whole platform.
  uint public constant RATIO_DENOMINATOR = 100_000;
  /// @dev If slippage not defined for concrete token will be used 5% tolerance.
  uint public constant DEFAULT_SLIPPAGE = 5_000;

  // *************************************************************
  //                        VARIABLES
  //                Keep names and ordering!
  //                 Add only in the bottom.
  // *************************************************************

  /// @dev We will convert all tokens to TETU and distribute to destinations.
  address public tetu;
  /// @dev Minimum amount of TETU tokens for distribution.
  uint public tetuThreshold;
  /// @dev Specific slippages for volatile tokens.
  mapping(address => uint) public tokenSlippage;
  /// @dev Percent of tokens for Invest Fund
  uint public toInvestFundRatio;
  /// @dev Percent of tokens for gauges.
  uint public toGaugesRatio;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Distributed(
    address sender,
    address token,
    uint balance,
    uint tetuValue,
    uint tetuBalance,
    uint toInvestFund,
    uint toGauges,
    uint toVeTetu
  );
  event InvestFundRatioChanged(uint oldValue, uint newValue);
  event GaugeRatioChanged(uint oldValue, uint newValue);
  event TetuThresholdChanged(uint oldValue, uint newValue);
  event SlippageChanged(address token, uint value);

  // *************************************************************
  //                        INIT
  // *************************************************************

  /// @dev Proxy initialization. Call it after contract deploy.
  function init(address controller_, address _tetu) external initializer {
    __Controllable_init(controller_);
    tetu = _tetu;
    // 10k TETU by default
    tetuThreshold = 10_000 * 1e18;
  }

  // *************************************************************
  //                      GOV ACTIONS
  // *************************************************************

  /// @dev Check that sender is governance.
  function _onlyGov() internal view {
    require(isGovernance(msg.sender), "DENIED");
  }

  /// @dev Set specific token slippage for given token.
  function setSlippage(address token, uint value) external {
    _onlyGov();
    require(value < RATIO_DENOMINATOR, "TOO_HIGH");

    tokenSlippage[token] = value;
    emit SlippageChanged(token, value);
  }

  /// @dev Set TETU threshold for distribution.
  function setTetuThreshold(uint value) external {
    _onlyGov();

    emit TetuThresholdChanged(tetuThreshold, value);
    tetuThreshold = value;
  }

  // *************************************************************
  //                     VOTER ACTIONS
  // *************************************************************

  /// @dev Check that sender is platform voter.
  function _onlyPlatformVoter() internal view {
    require(msg.sender == IController(controller()).platformVoter(), "DENIED");
  }

  /// @dev veTETU holders can change proportion via special voter.
  function setInvestFundRatio(uint value) external override {
    _onlyPlatformVoter();
    require(value <= RATIO_DENOMINATOR, "TOO_HIGH");

    emit InvestFundRatioChanged(toInvestFundRatio, value);
    toInvestFundRatio = value;
  }

  /// @dev veTETU holders can change proportion via special voter.
  function setGaugesRatio(uint value) external override {
    _onlyPlatformVoter();
    require(value <= RATIO_DENOMINATOR, "TOO_HIGH");

    emit GaugeRatioChanged(toGaugesRatio, value);
    toGaugesRatio = value;
  }

  // *************************************************************
  //                      DISTRIBUTE
  // *************************************************************

  /// @dev Try to distribute given token if the TETU value is higher than threshold.
  ///      No strict access.
  ///      We assume that amount will be distributed before accumulate huge value reasonable for arbitrage attack.
  function distribute(address token) external nonReentrant override {
    address _tetu = tetu;
    IController controller_ = IController(controller());
    ITetuLiquidator _liquidator = ITetuLiquidator(controller_.liquidator());

    (ITetuLiquidator.PoolData[] memory route, string memory error)
    = _liquidator.buildRoute(token, _tetu);

    if (route.length == 0) {
      revert(error);
    }

    uint balance = IERC20(token).balanceOf(address(this));

    // calculate balance in tetu value for check threshold
    uint tetuValue = _liquidator.getPriceForRoute(route, balance);

    // if the value higher than threshold distribute to destinations
    if (tetuValue > tetuThreshold) {

      uint slippage = tokenSlippage[token];
      if (slippage == 0) {
        slippage = DEFAULT_SLIPPAGE;
      }

      // we need to approve each time, liquidator address can be changed in controller
      // reset approves not necessary - assume that the all balance will be transferred
      IERC20(token).safeApprove(address(_liquidator), balance);
      _liquidator.liquidateWithRoute(route, balance, slippage);


      uint tetuBalance = IERC20(_tetu).balanceOf(address(this));

      uint toInvestFund = tetuBalance * toInvestFundRatio / RATIO_DENOMINATOR;
      uint toGauges = (tetuBalance - toInvestFund) * toGaugesRatio / RATIO_DENOMINATOR;
      uint toVeTetu = (tetuBalance - toInvestFund) - toGauges;

      if (toInvestFund != 0) {
        IERC20(_tetu).safeTransfer(controller_.investFund(), toInvestFund);
      }

      if (toGauges != 0) {
        address voter = controller_.voter();
        IERC20(_tetu).safeApprove(voter, toGauges);
        IVoter(voter).notifyRewardAmount(toGauges);
      }

      if (toVeTetu != 0) {
        address distributor = controller_.veDistributor();
        IERC20(_tetu).safeTransfer(distributor, toVeTetu);
        IVeDistributor(distributor).checkpoint();
      }

      emit Distributed(
        msg.sender,
        token,
        balance,
        tetuValue,
        tetuBalance,
        toInvestFund,
        toGauges,
        toVeTetu
      );

    }
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IForwarder).interfaceId || super.supportsInterface(interfaceId);
  }

}
