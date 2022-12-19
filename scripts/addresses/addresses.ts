import {CoreAddresses} from "../models/CoreAddresses";
import {GoerliAddresses} from "./goerli";
import {PolygonAddresses} from "./polygon";
import {SepoliaAddresses} from "./sepolia";
import {IToolsAddresses} from "../models/ToolsAddresses";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class Addresses {

  public static CORE = new Map<number, CoreAddresses>([
    [5, GoerliAddresses.CORE_ADDRESSES],
    [11155111, SepoliaAddresses.CORE_ADDRESSES],
    [137, PolygonAddresses.CORE_ADDRESSES],
  ]);

  public static TOOLS = new Map<number, IToolsAddresses>([
    [5, GoerliAddresses.TOOLS_ADDRESSES],
    [11155111, SepoliaAddresses.TOOLS_ADDRESSES],
    [137, PolygonAddresses.TOOLS_ADDRESSES],
  ]);

  public static getCore(): CoreAddresses {
    return Addresses.CORE.get(hre.network.config.chainId) as CoreAddresses;
  }

  public static getTools(): IToolsAddresses {
    return Addresses.TOOLS.get(hre.network.config.chainId) as IToolsAddresses;
  }

  public static get(): PolygonAddresses | GoerliAddresses | SepoliaAddresses {
    switch (hre.network.config.chainId) {
      case 5: return GoerliAddresses;
      case 137: return PolygonAddresses;
      case 11155111: return SepoliaAddresses;
      default: throw Error('Unsupported network');
    }
  }

}
