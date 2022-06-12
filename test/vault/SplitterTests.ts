import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal,
  MockGauge,
  MockSplitter, MockStrategy,
  MockToken,
  MockVault,
  MockVaultController,
  MockVaultSimple,
  MockVaultSimple__factory,
  ProxyControlled,
  StrategySplitterV2,
  TetuVaultV2,
  TetuVaultV2__factory,
  VaultInsurance,
  VaultInsurance__factory
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Splitter tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let controller: ControllerMinimal;
  let usdc: MockToken;
  let tetu: MockToken;
  let vault: TetuVaultV2;
  let splitter: StrategySplitterV2;
  let mockGauge: MockGauge;
  let strategy: MockStrategy;

  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    await usdc.transfer(signer2.address, parseUnits('1', 6));

    mockGauge = await DeployerUtils.deployContract(signer, 'MockGauge', controller.address) as MockGauge;
    vault = await DeployerUtils.deployTetuVaultV2(
      signer,
      controller.address,
      usdc.address,
      'USDC',
      'USDC',
      mockGauge.address,
      0
    );

    splitter = await DeployerUtils.deploySplitter(signer, controller.address, usdc.address, vault.address);
    await vault.setSplitter(splitter.address)

    await usdc.connect(signer2).approve(vault.address, Misc.MAX_UINT);
    await usdc.connect(signer1).approve(vault.address, Misc.MAX_UINT);
    await usdc.approve(vault.address, Misc.MAX_UINT);

    strategy = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("totalAssets without strategies test", async () => {
    await vault.deposit(100, signer.address);
    expect(await splitter.totalAssets()).eq(100);
  });

  it("maxCheapWithdraw without strategies test", async () => {
    await vault.deposit(100, signer.address);
    expect(await splitter.maxCheapWithdraw()).eq(100);
  });

  it("strategiesLength test", async () => {
    expect(await splitter.strategiesLength()).eq(0);
  });

  it("allStrategies test", async () => {
    expect((await splitter.allStrategies()).length).eq(0);
  });

  it("set strategy test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [100]);
    expect((await splitter.allStrategies()).length).eq(1);
  });

  it("set strategy wrong asset revert", async () => {
    await strategy.init(controller.address, splitter.address, tetu.address);
    await expect(splitter.addStrategies([strategy.address], [100])).revertedWith("SS: Wrong asset");
  });

  it("set strategy wrong splitter revert", async () => {
    await strategy.init(controller.address, tetu.address, usdc.address);
    await expect(splitter.addStrategies([strategy.address], [100])).revertedWith("SS: Wrong splitter");
  });

  it("set strategy wrong controller revert", async () => {
    const c = await DeployerUtils.deployMockController(signer);
    await strategy.init(c.address, splitter.address, usdc.address);
    await expect(splitter.addStrategies([strategy.address], [100])).revertedWith("SS: Wrong controller");
  });

  it("set strategy already exist revert", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [100]);
    await expect(splitter.addStrategies([strategy.address], [100])).revertedWith("SS: Already exist");
  });

  it("remove strategy test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    const strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
    await strategy2.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [100, 100]);
    expect((await splitter.allStrategies()).length).eq(2);
    await splitter.removeStrategies([strategy.address]);
    expect((await splitter.allStrategies()).length).eq(1);
  });

  it("remove strategy empty revert", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await expect(splitter.removeStrategies([strategy.address])).revertedWith("SS: Empty strategies");
  });

  it("remove strategy test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [100]);
    await expect(splitter.removeStrategies([signer.address])).revertedWith("SS: Strategy not found");
  });

  it("rebalance empty strats revert", async () => {
    await expect(splitter.rebalance(1, 1)).revertedWith("SS: Length");
  });

  it("rebalance wrong percent revert", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    const strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
    await strategy2.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [100, 100]);
    await expect(splitter.rebalance(1000, 1)).revertedWith("SS: Percent");
  });

  it("rebalance no liq revert", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    const strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
    await strategy2.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [100, 100]);
    await expect(splitter.rebalance(1, 1)).revertedWith("SS: No strategies");
  });

  it("rebalance test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    const strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
    await strategy2.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [50, 100]);
    await vault.deposit(100, signer.address);
    await splitter.setAPRs([strategy.address], [200]);
    await splitter.rebalance(1, 1);
  });

  it("withdraw without strategies test", async () => {
    await vault.deposit(100, signer.address);
    await vault.withdraw(100, signer.address, signer.address);
  });

});
