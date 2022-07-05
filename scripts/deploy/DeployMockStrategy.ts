import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {RunHelper} from "../utils/RunHelper";
import {MockStrategy, MockStrategy__factory, StrategySplitterV2, StrategySplitterV2__factory} from "../../typechain";
import {Addresses} from "../addresses/addresses";

const SPLITTER = '0xe71ee698325d55ce387fe143a92d1ac2c0501e90';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const strategy1 = MockStrategy__factory.connect(await DeployerUtils.deployProxy(signer, 'MockStrategy'), signer);
  await RunHelper.runAndWait(() => strategy1.init(
    core.controller,
    SPLITTER
  ));

  const strategy2 = MockStrategy__factory.connect(await DeployerUtils.deployProxy(signer, 'MockStrategy'), signer);
  await RunHelper.runAndWait(() => strategy2.init(
    core.controller,
    SPLITTER
  ));

  const strategy3 = MockStrategy__factory.connect(await DeployerUtils.deployProxy(signer, 'MockStrategy'), signer);
  await RunHelper.runAndWait(() => strategy3.init(
    core.controller,
    SPLITTER
  ));

  const splitter = StrategySplitterV2__factory.connect(SPLITTER, signer);
  await RunHelper.runAndWait(() => splitter.addStrategies(
    [strategy1.address, strategy2.address, strategy3.address],
    [100, 201, 10]
  ));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
