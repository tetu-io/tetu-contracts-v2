import {CoreAddresses} from "../models/CoreAddresses";
import {MumbaiCoreAddresses} from "./mumbai";
import {ArbtestCoreAddresses} from "./arbtest";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class Addresses {

  public static CORE = new Map<number, CoreAddresses>([
    [80001, MumbaiCoreAddresses.ADDRESSES],
    [421611, ArbtestCoreAddresses.ADDRESSES],
  ]);

  public static getCore(): CoreAddresses {
    return Addresses.CORE.get(hre.network.config.chainId) as CoreAddresses;
  }

}
