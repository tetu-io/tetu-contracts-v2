/* tslint:disable:variable-name */
// noinspection JSUnusedGlobalSymbols

import {CoreAddresses} from "../models/CoreAddresses";
import {IToolsAddresses} from "../models/ToolsAddresses";

// noinspection SpellCheckingInspection
export class PolygonAddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x255707B70BF90aa112006E1b07B9AeA6De021424", // tetu
    "0x699cCd3E558c1477763E5450ed9b4897Ed4E2ed3", // controller
    "0xC0Ef7D91f0773043b368A4C668C25041809C9377", // ve
    "0x026B1DF542B479609a965096D38b317DA110cCA3", // veDist
    "0x40f8f797173f0b1F2936d6C63Eaf15c2703894e1", // gauge
    "0xEC216E2D89889DFab7A741feB1962695c389429F", // bribe
    "0x2efcF008815903A5104538A78587155811eCA2da", // tetuVoter
    "0xf513AB41e39CEFF6a50313b36AE18614055C25A3", // platformVoter
    "0xA826097f16B47bE05C9002342C388C277cd56De5", // forwarder
    "0x0DB3F125a484F0019b91dD1897dcED4c02104fA5", // vaultFactory
  );

  public static TOOLS_ADDRESSES: IToolsAddresses = {
    converter: "0x8190db4549E382dECD94aEe211eAeB5F3DbC6836",
    multicall: "0x9e059EdB32FC27430CfC8c9025a55B7C0FcFAbda",
  };

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

}
