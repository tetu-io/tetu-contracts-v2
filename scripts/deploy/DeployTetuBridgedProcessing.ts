import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {TetuBridgedProcessing} from "../../typechain";
import {PolygonAddresses} from "../addresses/polygon";


async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployContract(signer, 'TetuBridgedProcessing', PolygonAddresses.TETU_TOKEN, PolygonAddresses.fxTETU_TOKEN, PolygonAddresses.GOVERNANCE);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
