/* tslint:disable:variable-name */
// noinspection JSUnusedGlobalSymbols

import {CoreAddresses} from "../models/CoreAddresses";
import {ToolsAddresses} from "../models/ToolsAddresses";

// noinspection SpellCheckingInspection
export class ZkEvmAddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x7C1B24c139a3EdA18Ab77C8Fa04A0F816C23e6D4", // tetu
    "0x35B0329118790B8c8FC36262812D92a4923C6795", // controller
    "0x0000000000000000000000000000000000000000", // ve
    "0x0000000000000000000000000000000000000000", // veDist
    "0xd353254872E8797B159594c1E528b8Be9a6cb1F8", // gauge
    "0x0000000000000000000000000000000000000000", // bribe
    "0x099C314F792e1F91f53765Fc64AaDCcf4dCf1538", // tetuVoter
    "0x0000000000000000000000000000000000000000", // platformVoter
    "0x255707B70BF90aa112006E1b07B9AeA6De021424", // forwarder
    "0xeFBc16b8c973DecA383aAAbAB07153D2EB676556", // vaultFactory
    "0x5373C3d09C39D8F256f88E08aa61402FE14A3792", // investFundV2
  );

  public static TOOLS_ADDRESSES = new ToolsAddresses(
    "0xBcda73B7184D5974F77721db79ff8BA190b342ce",
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

  public static WETH_TOKEN = "0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9".toLowerCase();

  public static USDC_TOKEN = "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035".toLowerCase();
  public static USDT_TOKEN = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d".toLowerCase();

  public static WBTC_TOKEN = "0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1".toLowerCase();
  public static DAI_TOKEN = "0xC5015b9d9161Dca7e18e32f6f25C4aD850731Fd4".toLowerCase();


}
