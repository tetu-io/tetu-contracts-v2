/* tslint:disable:variable-name */
// noinspection JSUnusedGlobalSymbols

import {CoreAddresses} from "../models/CoreAddresses";
import {ToolsAddresses} from "../models/ToolsAddresses";

// noinspection SpellCheckingInspection
export class BaseAddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x7C1B24c139a3EdA18Ab77C8Fa04A0F816C23e6D4", // tetu
    "", // controller
    "", // ve
    "", // veDist
    "", // gauge
    "", // bribe
    "", // tetuVoter
    "", // platformVoter
    "", // forwarder
    "", // vaultFactory
    "", // investFundV2
  );

  public static TOOLS_ADDRESSES = new ToolsAddresses(
    "",// todo
    "",// todo
    "",// todo
  );

  public static GOVERNANCE = "".toLowerCase();

  // Additional TETU contracts
  public static HARDWORK_RESOLVER = "".toLowerCase();
  public static FORWARDER_RESOLVER = "".toLowerCase();
  public static SPLITTER_REBALANCE_RESOLVER = "".toLowerCase();
  public static PERF_FEE_TREASURY = "".toLowerCase(); // todo
  public static TETU_BRIDGED_PROCESSING = "".toLowerCase();
  public static REWARDS_REDIRECTOR = "".toLowerCase(); // todo
  public static BRIBE_DISTRIBUTION = "".toLowerCase();
  public static DEPOSIT_HELPER_V2 = "".toLowerCase(); // todo
  public static ONE_INCH_ROUTER_V5 = "0x1111111254EEB25477B68fb85Ed929f73A960582".toLowerCase();

  // Tetu V2 vaults and strategies

  public static tUSDbC = "".toLowerCase(); // todo


  // tokens
  public static TETU_TOKEN = "0x7C1B24c139a3EdA18Ab77C8Fa04A0F816C23e6D4".toLowerCase(); // todo

  public static WETH_TOKEN = ''.toLowerCase(); // todo

  public static USDC_TOKEN = ''.toLowerCase(); // todo
  public static USDT_TOKEN = ''.toLowerCase(); // todo

  public static WBTC_TOKEN = ''.toLowerCase(); // todo
  public static DAI_TOKEN = ''.toLowerCase(); // todo


}
