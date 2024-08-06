import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ControllerMinimal,
  MockGauge__factory,
  MockStrategy,
  MockStrategy__factory,
  MockToken,
  SplitterRebalanceResolver,
  SplitterRebalanceResolver__factory,
  StrategySplitterV2,
  TetuVaultV2,
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("SplitterRebalanceResolverTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let controller: ControllerMinimal
  let resolver: SplitterRebalanceResolver;
  let vault: TetuVaultV2
  let splitter: StrategySplitterV2
  let strategyAsSplitter: MockStrategy;
  let strategyAsSplitter2: MockStrategy;
  let usdc: MockToken

  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);

    resolver = SplitterRebalanceResolver__factory.connect(await DeployerUtils.deployProxy(signer, 'SplitterRebalanceResolver'), signer)
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
    strategyAsSplitter2 = MockStrategy__factory.connect(
      (await DeployerUtils.deployProxy(signer, 'MockStrategy')),
      await Misc.impersonate(splitter.address)
    );
    await strategyAsSplitter.init(controller.address, splitter.address);
    await strategyAsSplitter2.init(controller.address, splitter.address);
    await splitter.addStrategies([strategyAsSplitter.address, strategyAsSplitter2.address], [100, 50], [0, 0]);
    const amount = parseUnits('1', 6);
    await usdc.transfer(strategyAsSplitter.address, amount);
    await usdc.transfer(strategyAsSplitter2.address, amount.mul(2));

    await strategyAsSplitter.investAll(amount, true);
    await strategyAsSplitter2.investAll(amount, true);

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

  it("setPercentPerVault", async () => {
    await resolver.setPercentPerVault(vault.address, 1)
  });

  it("setTolerancePerVault", async () => {
    await resolver.setTolerancePerVault(vault.address, 1)
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

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 3);
    // can not exec if no hw long time
    expect((await resolver.checker()).canExec).eq(false)

    await splitter.doHardWorkForStrategy(strategyAsSplitter.address, true);
    await splitter.doHardWorkForStrategy(strategyAsSplitter2.address, true);

    const data = await resolver.checker();
    expect(data.canExec).eq(true)
    const vaultCall = SplitterRebalanceResolver__factory.createInterface().decodeFunctionData('call', data.execPayload).vault;
    expect(vaultCall).eq(vault.address)

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
    await strategyAsSplitter.investAll(amount, true);
    expect((await resolver.checker()).canExec).eq(true)
  });

  it("execute call", async () => {
    const data = await resolver.checker();
    expect(data.canExec).eq(true)
    // console.log('data.execPayload', data.execPayload)
    const vaultCall = SplitterRebalanceResolver__factory.createInterface().decodeFunctionData('call', data.execPayload).vault
    expect(vaultCall).eq(vault.address)

    await expect(resolver.call(vaultCall)).revertedWith('SS: Denied')

    await controller.addOperator(resolver.address)
    const gas = (await resolver.estimateGas.call(vaultCall)).toNumber();
    expect(gas).below(15_000_000);
    await resolver.call(vaultCall)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await resolver.setDelayRate([vault.address], 2 * 100_000)

    // cant exec because delay now 2 * 1 day
    expect((await resolver.checker()).canExec).eq(false)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await splitter.doHardWorkForStrategy(strategyAsSplitter.address, true);
    await splitter.doHardWorkForStrategy(strategyAsSplitter2.address, true);
    expect((await resolver.checker()).canExec).eq(true)

    await resolver.call(vaultCall)
  })
})
