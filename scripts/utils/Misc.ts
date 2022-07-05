import hre, {ethers} from "hardhat";
import {Logger} from "tslog";
import Common from "ethereumjs-common";
import logSettings from "../../log_settings";

const log: Logger = new Logger(logSettings);

const MATIC_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'matic',
    networkId: 137,
    chainId: 137
  },
  'petersburg'
);

const FANTOM_CHAIN = Common.forCustomChain(
  'mainnet', {
    name: 'fantom',
    networkId: 250,
    chainId: 250
  },
  'petersburg'
);

export class Misc {
  public static readonly SECONDS_OF_DAY = 60 * 60 * 24;
  public static readonly SECONDS_OF_YEAR = Misc.SECONDS_OF_DAY * 365;
  public static readonly ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  public static readonly MAX_UINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  public static readonly MAX_UINT_MINUS_ONE = '115792089237316195423570985008687907853269984665640564039457584007913129639934';

  public static printDuration(text: string, start: number) {
    log.info('>>>' + text, ((Date.now() - start) / 1000).toFixed(1), 'sec');
  }

  // public static async getBlockTsFromChain(): Promise<number> {
  //   const signer = (await ethers.getSigners())[0];
  //   const tools = await DeployerUtils.getToolsAddresses();
  //   const ctr = await DeployerUtils.connectInterface(signer, 'Multicall', tools.multicall) as Multicall;
  //   const ts = await ctr.getCurrentBlockTimestamp();
  //   return ts.toNumber();
  // }

  public static async getChainConfig() {
    const net = await ethers.provider.getNetwork();
    switch (net.chainId) {
      case 137:
        return MATIC_CHAIN;
      case 250:
        return FANTOM_CHAIN;
      default:
        throw new Error('Unknown net ' + net.chainId)
    }
  }

  // ************** ADDRESSES **********************

  public static async impersonate(address: string) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [address, "0x1431E0FAE6D7217CAA0000000"],
    });
    console.log('address impersonated', address);
    return ethers.getSigner(address);
  }

  public static async isNetwork(id: number) {
    return (await ethers.provider.getNetwork()).chainId === id;
  }

  public static async getStorageAt(address: string, index: string) {
    return ethers.provider.getStorageAt(address, index);
  }

  public static async setStorageAt(address: string, index: string, value: string) {
    await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
    await ethers.provider.send("evm_mine", []); // Just mines to the next block
  }

  // ****************** WAIT ******************

  public static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static async wait(blocks: number) {
    if (hre.network.name === 'hardhat') {
      return;
    }
    const start = ethers.provider.blockNumber;
    while (true) {
      log.info('wait 10sec');
      await Misc.delay(10000);
      if (ethers.provider.blockNumber >= start + blocks) {
        break;
      }
    }
  }

}
