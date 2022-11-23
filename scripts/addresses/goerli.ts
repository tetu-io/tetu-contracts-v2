import {CoreAddresses} from "../models/CoreAddresses";
import {IToolsAddresses} from "../models/ToolsAddresses";

export class GoerliAddresses {

  public static CORE_ADDRESSES = new CoreAddresses(
    "0x88a12B7b6525c0B46c0c200405f49cE0E72D71Aa", // tetu
  "0x0EFc2D2D054383462F2cD72eA2526Ef7687E1016", // controller
  "0xA43eA51b3251f96bB48c48567A93b15e7e4b99F6", // ve
  "0x6B2e0fACD2F2A8f407aC591067Ac06b5d29247E4", // veDist
  "0x7AD5935EA295c4E743e4f2f5B4CDA951f41223c2", // gauge
  "0x81367059892aa1D8503a79a0Af9254DD0a09afBF", // bribe
  "0x225084D30cc297F3b177d9f93f5C3Ab8fb6a1454", // tetuVoter
  "0x422282F18CFE573e7dc6BEcC7242ffad43340aF8", // platformVoter
  "0xeFBc16b8c973DecA383aAAbAB07153D2EB676556", // forwarder
  "0xCF66857b468740d6dbF9cE11929A9c03DDA12988", // vaultFactory
  );

  public static TOOLS_ADDRESSES: IToolsAddresses = {
    converter: "",
    multicall: "",
  };
}


// usdc: 0x308A756B4f9aa3148CaD7ccf8e72c18C758b2EF2
// btc: 0x27af55366a339393865FC5943C04bc2600F55C9F
// weth: 0xbf1e638871c59859db851674c7f94efcb0f40954
// liquidator: 0x3bDbd2Ed1A214Ca4ba4421ddD7236ccA3EF088b6
// factory: 0xB6Ca119F30B3E7F6589F8a053c2a10B753846e78
// uniSwapper: 0xF9E426dF37D75875b136d9D25CB9f27Ee9E43C4f
// usdcBtc: 0x53cBAb0D7E5e2B44216B1AB597D85E33C23Fe1Db
// usdcWeth: 0x9B09fc5Efb7a16b15F53130f06AE21f1fC106680
// btcWeth: 0x01490bd35C56766dD20D2b347EF73b6E40562779
// usdcTetu: 0x58639D7ab0E26373205B9f54585c719a3F652650
