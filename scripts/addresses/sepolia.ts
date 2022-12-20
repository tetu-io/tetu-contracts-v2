import {CoreAddresses} from "../models/CoreAddresses";
import {IToolsAddresses} from "../models/ToolsAddresses";

export class SepoliaAddresses {

  public static TOOLS_ADDRESSES: IToolsAddresses = {
    liquidator: "",
    converter: "",
    multicall: "",
  };

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x549aE613Bb492CCf68A6620848C80262709a1fb4", // tetu
  "0xbf1fc29668e5f5Eaa819948599c9Ac1B1E03E75F", // controller
  "0x286c02C93f3CF48BB759A93756779A1C78bCF833", // ve
  "0x0A0846c978a56D6ea9D2602eeb8f977B21F3207F", // veDist
  "0x00379dD90b2A337C4652E286e4FBceadef940a21", // gauge
  "0x57Cf87b92E38f619bBeB2F13800730e668d69d7D", // bribe
  "0xB5A5D5fE893bC26C6E70CEbb8a193f764A438fd5", // tetuVoter
  "0x13d862a01d0AB241509A2e47e31d0db04e9b9F49", // platformVoter
  "0xbEB411eAD71713E7f2814326498Ff2a054242206", // forwarder
  "0xFC9b894D0b4a34AB41278Df5F2aBEEb5de95c9e4", // vaultFactory
  );

}

// deposit helper 0x6d85966b5280Bfbb479E0EBA00Ac5ceDfe8760D3

// usdc: 0x27af55366a339393865FC5943C04bc2600F55C9F
// btc: 0x0ed08c9A2EFa93C4bF3C8878e61D2B6ceD89E9d7
// weth: 0x078b7c9304eBA754e916016E8A8939527076f991
// liquidator: 0x8d6479dF2c152F99C23493c8ebbaf63DC586024b
// factory: 0xB393cA1442621c3356600e5B10B3510B5180d948
// uniSwapper: 0x01D0b17AC7B72cD4b051840e27A2134F25C53265
// usdcBtc: 0xB4747653510E8a4DE0A03E2bAb09Dd5150DAad34
// usdcWeth: 0xf210A6B37ddf47517c5d9E5AE3d24Bea5E398fa8
// btcWeth: 0x55BC8E9C917CEB8D9195198c5F4972C2E443280A
// usdcTetu: 0x27AaD9E67Ad9596D6f3f23c71D4cB5ef2080CE2F
