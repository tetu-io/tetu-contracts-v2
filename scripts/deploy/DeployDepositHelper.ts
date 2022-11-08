import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {InvestFundV2__factory} from "../../typechain";
import {Addresses} from "../addresses/addresses";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const MULTI_SWAP_POLY = '0x11637b94Dfab4f102c21fDe9E34915Bb5F766A8a';
  await DeployerUtils.deployContract(signer, 'DepositHelper', MULTI_SWAP_POLY);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
