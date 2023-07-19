import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";
import {Addresses} from "../addresses/addresses";
import {HardWorkResolver__factory, SplitterRebalanceResolver__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const contract = await DeployerUtils.deployProxy(signer, 'SplitterRebalanceResolver');
  await RunHelper.runAndWait(() => SplitterRebalanceResolver__factory.connect(contract, signer).init(core.controller));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
