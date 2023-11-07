import {CoreAddresses} from "../models/CoreAddresses";
import {GoerliAddresses} from "./goerli";
import {PolygonAddresses} from "./polygon";
import {SepoliaAddresses} from "./sepolia";
import {ToolsAddresses} from "../models/ToolsAddresses";
import {BaseAddresses} from "./base";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class Addresses {

  public static CORE = new Map<number, CoreAddresses>([
    [5, GoerliAddresses.CORE_ADDRESSES],
    [11155111, SepoliaAddresses.CORE_ADDRESSES],
    [137, PolygonAddresses.CORE_ADDRESSES],
    [8453, BaseAddresses.CORE_ADDRESSES],
  ]);

  public static TOOLS = new Map<number, ToolsAddresses>([
    [137, PolygonAddresses.TOOLS_ADDRESSES],
    [8453, BaseAddresses.TOOLS_ADDRESSES],
  ]);

  public static getCore(): CoreAddresses {
    return Addresses.CORE.get(hre.network.config.chainId) as CoreAddresses;
  }

  public static getTools(): ToolsAddresses {
    return Addresses.TOOLS.get(hre.network.config.chainId) as ToolsAddresses;
  }

}
