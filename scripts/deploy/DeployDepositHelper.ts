import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {InvestFundV2__factory} from "../../typechain";
import {Addresses} from "../addresses/addresses";
import {PolygonAddresses} from "../addresses/polygon";

async function main() {
  const signer = (await ethers.getSigners())[0];
  await DeployerUtils.deployContract(signer, 'DepositHelper', PolygonAddresses.ONE_INCH_ROUTER);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
