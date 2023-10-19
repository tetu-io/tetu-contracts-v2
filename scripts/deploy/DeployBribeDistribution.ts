import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {Addresses} from "../addresses/addresses";
import {BribeDistribution} from "../../typechain";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  await DeployerUtils.deployContract(signer, "BribeDistribution", core.veDist, core.tetu);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
