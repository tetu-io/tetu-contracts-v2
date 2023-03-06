import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {InvestFundV2__factory, StrategySplitterV2} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";
import {Addresses} from "../addresses/addresses";
import {BigNumber} from "ethers";

/**
 * Run one of the following commands to run the script on stand-alone hardhat:
 *      npx hardhat run scripts/issues/DeploySplitterLogic.ts
 *      npx hardhat run --network localhost scripts/issues/DeploySplitterLogic.ts
 */
async function main() {
  const signer = (await ethers.getSigners())[0];

  const splitterImpl = await DeployerUtils.deployContract(signer, 'StrategySplitterV2');
  const result = splitterImpl.address;
  DeployerUtils.createFolderAndWriteFileSync('tmp/deployed/splitter.txt', result);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
