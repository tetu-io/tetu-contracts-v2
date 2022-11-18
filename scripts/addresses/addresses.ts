import {CoreAddresses} from "../models/CoreAddresses";
import {FujiAddresses} from "./fuji";
import {GoerliAddresses} from "./goerli";
import {PolygonAddresses} from "./polygon";
import {IToolsAddresses} from "../models/ToolsAddresses";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class Addresses {

  public static CORE = new Map<number, CoreAddresses>([
    [43113, FujiAddresses.CORE_ADDRESSES],
    [5, GoerliAddresses.CORE_ADDRESSES],
    [137, PolygonAddresses.CORE_ADDRESSES],
  ]);

  public static TOOLS = new Map<number, IToolsAddresses>([
    [43113, FujiAddresses.TOOLS_ADDRESSES],
    [5, GoerliAddresses.TOOLS_ADDRESSES],
    [137, PolygonAddresses.TOOLS_ADDRESSES],
  ]);

  public static getCore(): CoreAddresses {
    return Addresses.CORE.get(hre.network.config.chainId) as CoreAddresses;
  }

  public static getTools(): IToolsAddresses {
    return Addresses.TOOLS.get(hre.network.config.chainId) as IToolsAddresses;
  }

  public static get(): PolygonAddresses | GoerliAddresses | FujiAddresses {
    switch (hre.network.config.chainId) {
      case 5: return GoerliAddresses;
      case 137: return PolygonAddresses;
      case 43113: return FujiAddresses;
      default: throw Error('Unsupported network');
    }
  }

}
