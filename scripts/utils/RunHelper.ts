import {ethers} from "hardhat";
import {ContractTransaction} from "ethers";
import {Logger} from "tslog";
import logSettings from "../../log_settings";
import {Misc} from "./Misc";
import {WAIT_BLOCKS_BETWEEN_DEPLOY} from "../deploy/DeployContract";

const log: Logger<unknown> = new Logger(logSettings);

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

export class RunHelper {

  public static async runAndWait(callback: () => Promise<ContractTransaction>, stopOnError = true, wait = true) {
    console.log('Start on-chain transaction')
    const start = Date.now();

    if (hre.network.name === 'hardhat') {
      wait = false;
    }

    const tr = await callback();
    if (!wait) {
      Misc.printDuration('runAndWait completed', start);
      return;
    }
    const r0 = await tr.wait(WAIT_BLOCKS_BETWEEN_DEPLOY);

    log.info('tx sent', tr.hash, 'gas used:', r0.gasUsed.toString());

    let receipt;
    while (true) {
      receipt = await ethers.provider.getTransactionReceipt(tr.hash);
      if (!!receipt) {
        break;
      }
      log.info('not yet complete', tr.hash);
      await Misc.delay(10000);
    }
    log.info('transaction result', tr.hash, receipt?.status);
    log.info('gas used', receipt.gasUsed.toString());
    if (receipt?.status !== 1 && stopOnError) {
      throw Error("Wrong status!");
    }
    Misc.printDuration('runAndWait completed', start);
  }

}
