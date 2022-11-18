import {CoreAddresses} from "../models/CoreAddresses";
import {IToolsAddresses} from "../models/ToolsAddresses";

export class FujiAddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0xDe0636C1A6B9295aEF794aa32c39bf1F9F842CAd", // tetu
  "0xA609fA657A9cfbD658be45dcbe31cc477F2d6d18", // controller
  "0x318ecFd6B245Ae618D68e702a51fc3dcaaeac1b9", // ve
  "0xcD28E94250BF036d415F374147bA2603D8fFb1dC", // veDist
  "0xC6f4C2D429cCa2fe0706D6952c734DE86D8d43B3", // gauge
  "0xa56b6CF42b6eF22578D970027E8DC55101Fe2bD1", // bribe
  "0x1e0091Eee90f549db2995829aDa0c923947AFF0A", // tetuVoter
  "0xE82473DA60E41428E8e71287D968a03fbcd02a0e", // platformVoter
  "0x1F594c43503146dc08034a15141eDf8a0Be297E7", // forwarder
  "0x1606Cee37b0171fbCa4FB1982Dc51f9763ca0863", // vaultFactory
  );

  public static TOOLS_ADDRESSES: IToolsAddresses = {
    liquidator: "",
    converter: "",
    multicall: "",
  }
}

// usdc: 0xc9D292E9154193Ef4526DE3183c4EB854EF7e4BF
// btc: 0xB1FE2347e607775F156e9a38e44D9D07464552B9
// weth: 0xf63a048cd4f2dd03867b7db42b9ed34beef2ffe1
// liquidator: 0x8E3a87e63F251118827B4A5fe1440ad1C9123251
// factory: 0xa53AdB3de13AD418995176f81fcB4105fd0Fea3A
