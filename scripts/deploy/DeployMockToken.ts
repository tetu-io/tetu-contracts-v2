import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployMockToken(signer, 'WETH', 18);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
