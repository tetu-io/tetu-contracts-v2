import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {BaseAddresses} from "../addresses/base";

async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployContract(signer, 'DepositHelperBaseChain', BaseAddresses.ONE_INCH_ROUTER_V5);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
