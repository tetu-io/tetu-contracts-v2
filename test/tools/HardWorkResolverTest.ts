import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ControllerMinimal,
  HardWorkResolver,
  HardWorkResolver__factory,
  MockGauge__factory,
  TetuVaultV2,
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {formatUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("HardWorkResolverTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let controller: ControllerMinimal
  let resolver: HardWorkResolver;
  let vault: TetuVaultV2

  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();

    controller = await DeployerUtils.deployMockController(signer);
    const usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);

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

    const splitter = await DeployerUtils.deploySplitter(signer, controller.address, usdc.address, vault.address);
    await vault.setSplitter(splitter.address)

    await resolver.changeOperatorStatus(signer.address, true)
    await resolver.changeVaultStatus(vault.address, true)
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
      console.log(i, gas);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    }
  });

  it("checker", async () => {
    const gas = (await resolver.estimateGas.checker()).toNumber()
    expect(gas).below(15_000_000);
    let data = await resolver.checker();
    expect(data.canExec).eq(true)
    const vaults = HardWorkResolver__factory.createInterface().decodeFunctionData('call', data.execPayload)._vaults
    expect(vaults[0]).eq(vault.address)

    await resolver.setMaxGas(0)
    data = await resolver.checker({
      gasPrice: 1,
    });
    expect(data.canExec).eq(false)
  });

  it("execute call", async () => {
    const data = await resolver.checker();

    const vaults = HardWorkResolver__factory.createInterface().decodeFunctionData('call', data.execPayload)._vaults

    await expect(resolver.call(vaults)).revertedWith('SS: Denied')

    await controller.addOperator(resolver.address)
    const gas = (await resolver.estimateGas.call(vaults)).toNumber();
    expect(gas).below(15_000_000);
    await resolver.call(vaults)
  })
})