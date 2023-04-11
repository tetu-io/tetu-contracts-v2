import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {PolygonAddresses} from "../addresses/polygon";

async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployContract(signer, 'PerfFeeTreasury', '0x0644141dd9c2c34802d28d334217bd2034206bf7');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
