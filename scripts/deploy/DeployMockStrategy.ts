import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {RunHelper} from "../utils/RunHelper";
import {MockStrategy, StrategySplitterV2, StrategySplitterV2__factory} from "../../typechain";
import {Addresses} from "../addresses/addresses";

const SPLITTER = '0x2744b72ba87b793dddb20ee9d3196db8c9020791';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const contract = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
  await RunHelper.runAndWait(() => contract.init(
    core.controller,
    SPLITTER
  ));

  const splitter = StrategySplitterV2__factory.connect(SPLITTER, signer);
  await RunHelper.runAndWait(() => splitter.addStrategies([contract.address], [100]));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
