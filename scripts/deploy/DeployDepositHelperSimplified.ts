import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {PolygonAddresses} from "../addresses/polygon";
import {ZkEvmAddresses} from "../addresses/zkevm";

/**
 * npx hardhat run scripts/deploy/DeployDepositHelperSimplified.ts
 */
async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployContract(signer, 'DepositHelperSimplified', ZkEvmAddresses.OPENOCEAN_ROUTER);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
