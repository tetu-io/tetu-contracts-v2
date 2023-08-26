import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";
import {Addresses} from "../addresses/addresses";
import {ForwarderDistributeResolver__factory, HardWorkResolver__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  await DeployerUtils.deployContract(signer, 'RewardsRedirector', '0x0644141dd9c2c34802d28d334217bd2034206bf7', core.gauge);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
