/* tslint:disable:variable-name */
// noinspection JSUnusedGlobalSymbols

import {CoreAddresses} from "../models/CoreAddresses";
import {ToolsAddresses} from "../models/ToolsAddresses";

// noinspection SpellCheckingInspection
export class PolygonAddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x255707B70BF90aa112006E1b07B9AeA6De021424", // tetu
    "0x33b27e0A2506a4A2FBc213a01C51d0451745343a", // controller
    "0x6FB29DD17fa6E27BD112Bc3A2D0b8dae597AeDA4", // ve
    "0xf8d97eC3a778028E84D4364bCd72bb3E2fb5D18e", // veDist
    "0x4ED1dD7838dE3ec37a2b30902D3c3BE9B50C94a0", // gauge
    "0xAB45D768Ebca054861cEccbd2982F09C4076C4b4", // bribe
    "0x4cdF28d6244c6B0560aa3eBcFB326e0C24fe8218", // tetuVoter
    "0x5576Fe01a9e6e0346c97E546919F5d15937Be92D", // platformVoter
    "0x88115b5eA38AF3ED6357a26D161307D7F28D2EC9", // forwarder
    "0xaAd7a2517b0d0d15E3Da5C37C5371F7283cCc074", // vaultFactory
  );

  public static TOOLS_ADDRESSES = new ToolsAddresses(
    "0xC737eaB847Ae6A92028862fE38b828db41314772",
    "0x29Eead6Fd74F826dac9E0383abC990615AA62Fa7",
    "0x9e059EdB32FC27430CfC8c9025a55B7C0FcFAbda",
  );

  public static GOVERNANCE = "0xcc16d636dd05b52ff1d8b9ce09b09bc62b11412b".toLowerCase();

  // Additional TETU contracts
  public static TETU_EMITTER = "0x04eE7A5364803AAbE6021816146C34B4616c74D3".toLowerCase();
  public static HARDWORK_RESOLVER = "0xD578141F36BE210c90e8C734819db889e55A305b".toLowerCase();
  public static FORWARDER_RESOLVER = "0x6d16Fa76f61F2BEe0093D1DCbab29bcA4FBC8628".toLowerCase();

  // PROTOCOL ADRS
  public static DEPOSIT_HELPER_V1 = "0xBe866e2F1A292f37711a2A91A1B5C3CfB517C00d".toLowerCase();
  public static TETU_CONVERTER = "0x8190db4549E382dECD94aEe211eAeB5F3DbC6836".toLowerCase();
  public static tUSDC = "0x0D397F4515007AE4822703b74b9922508837A04E".toLowerCase();
  public static TETU_USDC_BPT_VAULT = "0x6922201f0d25Aba8368e7806642625879B35aB84".toLowerCase();

  // Tetu V2 vaults and strategies

  public static V2_VAULT_USDC = "0x0d397f4515007ae4822703b74b9922508837a04e";
  public static V2_VAULT_WMATIC = "0xf9d7a7fdd6fa57ebca160d6d2b5b6c4651f7e740";
  public static V2_VAULT_WETH = "0x088d316ee4943b04fe949b091e90a8cfd793d82b";
  public static V2_VAULT_WBTC = "0x34d4017f547d3d5d28d773f0a7c999a11c2b786b";

  public static V2_SPLITTER_USDC = "0xA31cE671A0069020F7c87ce23F9cAAA7274C794c";
  public static V2_SPLITTER_WMATIC = "0x645C823F09AA9aD886CfaA551BB2a29c5973804c";
  public static V2_SPLITTER_WETH = "0xb4e9CD554F14d3CB2d45300ed6464d462c017894";
  public static V2_SPLITTER_WBTC = "0x217dB66Dc9300AaCE215beEdc1Aa26741e58CC67";

  public static ONE_INCH_ROUTER = "0x1111111254fb6c44bAC0beD2854e76F90643097d".toLowerCase();

  // tokens
  public static WETH_TOKEN = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619".toLowerCase();
  public static USDC_TOKEN = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase();
  public static WMATIC_TOKEN = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270".toLowerCase();
  public static WBTC_TOKEN = "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6".toLowerCase();
  public static DAI_TOKEN = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063".toLowerCase();
  public static USDT_TOKEN = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase();
  public static LINK_TOKEN = "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39".toLowerCase();
  public static AAVE_TOKEN = "0xD6DF932A45C0f255f85145f286eA0b292B21C90B".toLowerCase();
  public static QI_TOKEN = "0x580A84C73811E1839F75d86d75d88cCa0c241fF4".toLowerCase();
  public static dxTETU = "0xacee7bd17e7b04f7e48b29c0c91af67758394f0f".toLowerCase();
  public static xTETU = "0x225084D30cc297F3b177d9f93f5C3Ab8fb6a1454".toLowerCase();
  public static TETU_TOKEN = "0x255707B70BF90aa112006E1b07B9AeA6De021424".toLowerCase();
  public static BAL_TOKEN = "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3".toLowerCase();
  public static tetuBAL_TOKEN = '0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33'.toLowerCase();
  public static USDPlus_TOKEN = '0x236eeC6359fb44CCe8f97E99387aa7F8cd5cdE1f'.toLowerCase();
  public static BALANCER_TETU_USDC = "0xE2f706EF1f7240b803AAe877C9C762644bb808d8".toLowerCase();

}
