import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ControllerMinimal,
  HardWorkResolver,
  HardWorkResolver__factory,
  MockGauge__factory, MockStrategy, MockStrategy__factory, MockToken, StrategySplitterV2,
  TetuVaultV2,
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("HardWorkResolverTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let controller: ControllerMinimal
  let resolver: HardWorkResolver;
  let vault: TetuVaultV2
  let splitter: StrategySplitterV2
  let strategyAsSplitter: MockStrategy;
  let usdc: MockToken

  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);

    resolver = HardWorkResolver__factory.connect(await DeployerUtils.deployProxy(signer, 'HardWorkResolver'), signer)
    await resolver.init(controller.address)

    const mockGauge = MockGauge__factory.connect(await DeployerUtils.deployProxy(signer, 'MockGauge'), signer);
    await mockGauge.init(controller.address)

    vault = await DeployerUtils.deployTetuVaultV2(
      signer,
      controller.address,
      usdc.address,
      'USDC',
      'USDC',
      mockGauge.address,
      10
    );

    splitter = await DeployerUtils.deploySplitter(signer, controller.address, usdc.address, vault.address);
    await vault.setSplitter(splitter.address)

    strategyAsSplitter = MockStrategy__factory.connect(
      (await DeployerUtils.deployProxy(signer, 'MockStrategy')),
      await Misc.impersonate(splitter.address)
    );
    await strategyAsSplitter.init(controller.address, splitter.address);
    await splitter.addStrategies([strategyAsSplitter.address], [100], [0]);
    const amount = parseUnits('1', 6);
    await usdc.transfer(strategyAsSplitter.address, amount);

    await strategyAsSplitter.investAll(amount, false);

    await resolver.changeOperatorStatus(signer.address, true)
    await controller.addVault(vault.address)
  })

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("setDelay", async () => {
    await resolver.setDelay(1)
  })

  it("setMaxGas", async () => {
    await resolver.setMaxGas(1)
  });

  it("setMaxHwPerCall", async () => {
    await resolver.setMaxHwPerCall(1)
  });

  it("changeOperatorStatus", async () => {
    await resolver.changeOperatorStatus(signer.address, false)
  });

  it("maxGasAdjusted", async () => {
    for (let i = 0; i < 30; i++) {
      const gas = formatUnits(await resolver.maxGasAdjusted(), 9);
      // console.log(i, gas);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    }
  });

  it("checker", async () => {
    const gas = (await resolver.estimateGas.checker()).toNumber()
    expect(gas).below(15_000_000);

    // cant exec because last hardwork was updated on splitter.addStrategies
    expect((await resolver.checker()).canExec).eq(false)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);

    const data = await resolver.checker();
    expect(data.canExec).eq(true)
    const vaults = HardWorkResolver__factory.createInterface().decodeFunctionData('call', data.execPayload)._vaults
    expect(vaults[0]).eq(vault.address)

    // cant exec with low gas price
    await resolver.setMaxGas(0)
    expect((await resolver.checker({gasPrice: 1,})).canExec).eq(false)

    expect((await resolver.checker()).canExec).eq(true)

    // cant exec when strategy was paused
    await splitter.pauseInvesting(strategyAsSplitter.address)
    expect((await resolver.checker()).canExec).eq(false)

    await splitter.continueInvesting(strategyAsSplitter.address, 0)
    expect((await resolver.checker()).canExec).eq(true)

    await strategyAsSplitter.withdrawAllToSplitter()

    // cant exec when strategy dont have assets
    expect((await resolver.checker()).canExec).eq(false)

    const amount = parseUnits('1', 6);
    await usdc.transfer(strategyAsSplitter.address, amount);
    await strategyAsSplitter.investAll(amount, false);
    expect((await resolver.checker()).canExec).eq(true)
  });

  it("execute call", async () => {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);

    const data = await resolver.checker();

    const vaults = HardWorkResolver__factory.createInterface().decodeFunctionData('call', data.execPayload)._vaults

    await expect(resolver.call(vaults)).revertedWith('SS: Denied')

    await controller.addOperator(resolver.address)
    const gas = (await resolver.estimateGas.call(vaults)).toNumber();
    expect(gas).below(15_000_000);
    await resolver.call(vaults)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await resolver.setDelayRate([vault.address], 2 * 100_000)

    // cant exec because delay now 2 * 1 day
    expect((await resolver.checker()).canExec).eq(false)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    expect((await resolver.checker()).canExec).eq(true)

    await resolver.call(vaults)
  })
})
