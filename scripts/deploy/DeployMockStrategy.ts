import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {RunHelper} from "../utils/RunHelper";
import {MockStrategy, MockStrategy__factory, StrategySplitterV2, StrategySplitterV2__factory} from "../../typechain";
import {Addresses} from "../addresses/addresses";

const SPLITTER = '0x24dc9f1b9ae0fA62acb120Ea77D7fC89C6814F72';

async function main() {
  const signer = (await ethers.getSigners())[0];

  const strategy1 = MockStrategy__factory.connect(await DeployerUtils.deployProxy(signer, 'MockStrategy'), signer);
  await setupStrategy(strategy1)

  const strategy2 = MockStrategy__factory.connect(await DeployerUtils.deployProxy(signer, 'MockStrategy'), signer);
  await setupStrategy(strategy2)

  const strategy3 = MockStrategy__factory.connect(await DeployerUtils.deployProxy(signer, 'MockStrategy'), signer);
  await setupStrategy(strategy3)

  const splitter = StrategySplitterV2__factory.connect(SPLITTER, signer);
  await RunHelper.runAndWait(() => splitter.addStrategies(
    [strategy1.address, strategy2.address, strategy3.address],
    [Math.round(Math.random() * 100), Math.round(Math.random() * 200), Math.round(Math.random() * 2)]
  ));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


async function setupStrategy(strategy: MockStrategy) {
  const core = Addresses.getCore();
  await RunHelper.runAndWait(() => strategy.init(
    core.controller,
    SPLITTER
  ));

  await RunHelper.runAndWait(() => strategy.setSlippage(Math.round(Math.random() * 500)));
  await RunHelper.runAndWait(() => strategy.setSlippageDeposit(Math.round(Math.random() * 500)));
  await RunHelper.runAndWait(() => strategy.setSlippageHardWork(Math.round(Math.random() * 500)));
  await RunHelper.runAndWait(() => strategy.setLast(Math.round(Math.random() * 1000_000), 0));
}
