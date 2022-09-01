import {CoreAddresses} from "../models/CoreAddresses";
import {FujiCoreAddresses} from "./fuji";
import {GoerliCoreAddresses} from "./goerli";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class Addresses {

  public static CORE = new Map<number, CoreAddresses>([
    [43113, FujiCoreAddresses.ADDRESSES],
    [5, GoerliCoreAddresses.ADDRESSES],
  ]);

  public static getCore(): CoreAddresses {
    return Addresses.CORE.get(hre.network.config.chainId) as CoreAddresses;
  }

}
