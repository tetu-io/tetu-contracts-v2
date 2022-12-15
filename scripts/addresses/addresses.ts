import {CoreAddresses} from "../models/CoreAddresses";
import {GoerliAddresses} from "./goerli";
import {PolygonAddresses} from "./polygon";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class Addresses {

  public static CORE = new Map<number, CoreAddresses>([
    [5, GoerliAddresses.CORE_ADDRESSES],
    [137, PolygonAddresses.CORE_ADDRESSES],
  ]);

  public static getCore(): CoreAddresses {
    return Addresses.CORE.get(hre.network.config.chainId) as CoreAddresses;
  }

}
