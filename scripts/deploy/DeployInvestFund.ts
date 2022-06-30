import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {InvestFundV2__factory} from "../../typechain";
import {Addresses} from "../addresses/addresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const fundAdr = await DeployerUtils.deployProxy(signer, 'InvestFundV2');
  const investFund = InvestFundV2__factory.connect(fundAdr, signer);
  await investFund.init(core.controller);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
