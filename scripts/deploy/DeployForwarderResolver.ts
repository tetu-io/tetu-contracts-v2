import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";
import {Addresses} from "../addresses/addresses";
import {ForwarderDistributeResolver__factory, HardWorkResolver__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const contract = await DeployerUtils.deployProxy(signer, 'ForwarderDistributeResolver');
  await RunHelper.runAndWait(() => ForwarderDistributeResolver__factory.connect(contract, signer).init(core.controller));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
