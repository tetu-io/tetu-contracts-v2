/* tslint:disable:variable-name */
// noinspection JSUnusedGlobalSymbols

import {CoreAddresses} from "../models/CoreAddresses";
import {ToolsAddresses} from "../models/ToolsAddresses";

// noinspection SpellCheckingInspection
export class Baseddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x5E42c17CAEab64527D9d80d506a3FE01179afa02", // tetu
    "0x255707B70BF90aa112006E1b07B9AeA6De021424", // controller
    "0xb8bA82F19A9Be6CbF6DAF9BF4FBCC5bDfCF8bEe6", // ve
    "0x875976AeF383Fe4135B93C3989671056c4dEcDFF", // veDist
    "0xD8a4054d63fCb0030BC73E2323344Ae59A19E92b", // gauge
    "0x0B62ad43837A69Ad60289EEea7C6e907e759F6E8", // bribe
    "0xFC9b894D0b4a34AB41278Df5F2aBEEb5de95c9e4", // tetuVoter
    "0xCa9C8Fba773caafe19E6140eC0A7a54d996030Da", // platformVoter
    "0xdfB765935D7f4e38641457c431F89d20Db571674", // forwarder
    "0xdc08482Fe34ccf74300e996966030cAc0F81F271", // vaultFactory
    "0x27af55366a339393865FC5943C04bc2600F55C9F", // investFundV2
  );

  public static TOOLS_ADDRESSES = new ToolsAddresses(
    "0x22e2625F9d8c28CB4BcE944E9d64efb4388ea991",
    "",
    "",
  );

  public static GOVERNANCE = "0x3f5075195b96B60d7D26b5cDe93b64A6D9bF33e2".toLowerCase();

  // Additional TETU contracts
  public static TETU_EMITTER = "".toLowerCase();
  public static HARDWORK_RESOLVER = "".toLowerCase();
  public static FORWARDER_RESOLVER = "".toLowerCase();
  public static SPLITTER_REBALANCE_RESOLVER = "".toLowerCase();
  public static PERF_FEE_TREASURY = "".toLowerCase();
  public static TETU_BRIDGED_PROCESSING = "".toLowerCase();
  public static REWARDS_REDIRECTOR = "".toLowerCase();
  public static BRIBE_DISTRIBUTION = "".toLowerCase();
  public static DEPOSIT_HELPER_V2 = "".toLowerCase();

  // Tetu V2 vaults and strategies


  // tokens
  public static TETU_TOKEN = "0x5E42c17CAEab64527D9d80d506a3FE01179afa02".toLowerCase();


}
