import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {Addresses} from "../addresses/addresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const veDist = await DeployerUtils.deployVeDistributorV2(
    signer,
    core.controller,
    core.ve,
    core.tetu,
  );

  console.log('veDist', veDist.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
