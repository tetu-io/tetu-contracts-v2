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

  it("set strategy denied revert", async () => {
    await expect(splitter.connect(signer2).addStrategies([strategy.address], [100])).revertedWith("SS: Denied");
  });

  it("set strategy test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [100]);
    expect((await splitter.allStrategies()).length).eq(1);
  });

  it("set strategy with time lock test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [100]);

    const strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
    await strategy2.init(controller.address, splitter.address, usdc.address);

    await splitter.scheduleStrategies([strategy2.address]);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 12);
    await splitter.addStrategies([strategy2.address], [100]);
    expect((await splitter.allStrategies()).length).eq(2);
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

  it("set strategy duplicate revert", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await expect(splitter.addStrategies([strategy.address, strategy.address], [100, 100])).revertedWith("SS: Duplicate");
  });

  it("set strategy time lock revert", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [100])
    const strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
    await strategy2.init(controller.address, splitter.address, usdc.address);
    await expect(splitter.addStrategies([strategy2.address], [100])).revertedWith("SS: Time lock");
  });

  it("remove strategy denied revert", async () => {
    await expect(splitter.connect(signer2).removeStrategies([strategy.address])).revertedWith("SS: Denied");
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

  it("rebalance denied revert", async () => {
    await expect(splitter.connect(signer2).rebalance(1, 1)).revertedWith("SS: Denied");
  });

  it("set apr denied revert", async () => {
    await expect(splitter.connect(signer2).setAPRs([], [])).revertedWith("SS: Denied");
  });

  it("rebalance empty strats revert", async () => {
    await expect(splitter.rebalance(1, 1)).revertedWith("SS: Length");
  });

  it("average apr test", async () => {
    expect(await splitter.averageApr(strategy.address)).eq(0);
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

  it("invest all denied revert", async () => {
    await expect(splitter.connect(signer2).investAll()).revertedWith("SS: Denied");
  });

  it("withdraw all denied revert", async () => {
    await expect(splitter.connect(signer2).withdrawAllToVault()).revertedWith("SS: Denied");
  });

  it("withdraw denied revert", async () => {
    await expect(splitter.connect(signer2).withdrawToVault(1)).revertedWith("SS: Denied");
  });

  it("do hard work denied revert", async () => {
    await expect(splitter.connect(signer2).doHardWork()).revertedWith("SS: Denied");
  });

  it("do hard work for strat denied revert", async () => {
    await expect(splitter.connect(signer2).doHardWorkForStrategy(strategy.address)).revertedWith("SS: Denied");
  });

  it("apr test", async () => {
    expect(await splitter.computeApr(100, 10, 60 * 60 * 24 * 365)).eq(10_000);
    expect(await splitter.computeApr(100, 10, 60 * 60 * 24)).eq(3650_000);
    expect(await splitter.computeApr(parseUnits('1234'), parseUnits('0.05'), 60 * 60 * 24)).eq(1_478);
    expect(await splitter.computeApr(0, 100, 60 * 60 * 24)).eq(0);
    expect(await splitter.computeApr(100, 100, 0)).eq(0);
  });

  it("remove last strategy test", async () => {
    await strategy.init(controller.address, splitter.address, usdc.address);
    await splitter.addStrategies([strategy.address], [50]);
    await splitter.removeStrategies([strategy.address])
    expect(await splitter.strategiesLength()).eq(0);
  });

  describe("with 3 strategies and assets by default", function () {

    let strategy2: MockStrategy;
    let strategy3: MockStrategy;

    before(async function () {
      await strategy.init(controller.address, splitter.address, usdc.address);
      strategy2 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
      await strategy2.init(controller.address, splitter.address, usdc.address);
      strategy3 = await DeployerUtils.deployContract(signer, 'MockStrategy') as MockStrategy;
      await strategy3.init(controller.address, splitter.address, usdc.address);
      await splitter.addStrategies([strategy.address, strategy2.address, strategy3.address], [50, 100, 1]);

      await vault.deposit(100, signer.address);
    });

    it("maxCheapWithdraw test", async () => {
      expect(await splitter.maxCheapWithdraw()).eq(100);
    });

    it("remove strategy test", async () => {
      await splitter.removeStrategies([strategy.address])
      expect(await splitter.strategiesLength()).eq(2);
    });

    it("rebalance slippage revert", async () => {
      await splitter.setAPRs([strategy.address], [200]);
      await strategy2.setSlippage(10);
      await expect(splitter.rebalance(100, 9_999)).revertedWith('SS: Slippage');
    });

    it("rebalance slippage test", async () => {
      await splitter.setAPRs([strategy.address], [200]);
      await strategy2.setSlippage(10);
      await splitter.rebalance(100, 10_001);
    });

    it("withdraw all test", async () => {
      await vault.withdrawAll();
    });

    it("withdraw all with slippage revert", async () => {
      await strategy2.setSlippage(10);
      await expect(vault.withdrawAll()).revertedWith("SLIPPAGE");
    });

    it("withdraw all with slippage covering from insurance test", async () => {
      await strategy2.setSlippage(1);
      await vault.setFees(0, 1_000)
      await vault.withdrawAll()
    });

    it("withdraw all with slippage covering from insurance not enough revert", async () => {
      await strategy2.setSlippage(2);
      await vault.setFees(0, 1_000)
      await expect(vault.withdrawAll()).revertedWith("SLIPPAGE");
    });

    it("withdraw with 100% slippage covering from insurance test", async () => {
      await strategy2.setSlippage(100);
      await vault.setFees(1_000, 1_000)
      await vault.deposit(1000_000, signer.address)
      await vault.withdraw(10, signer.address, signer.address);
    });

    it("withdraw all with 100% slippage covering from insurance test", async () => {
      await vault.setFees(1_000, 1_000)
      await vault.deposit(1000_000, signer.address)
      await vault.withdrawAll();
      await vault.deposit(100, signer.address)
      await strategy2.setSlippage(100);
      await vault.withdrawAll();
    });

    it("do hard work for strategy test", async () => {
      await splitter.doHardWorkForStrategy(strategy.address);
    });

    it("withdraw all with balance on splitter test", async () => {
      await strategy2.withdrawAll();
      await vault.withdrawAll();
    });

    it("withdraw part with balance on splitter test", async () => {
      await strategy2.withdrawAll();
      await vault.withdraw(10, signer.address, signer.address);
    });

    it("withdraw from multiple strategies test", async () => {
      await splitter.setAPRs([strategy.address], [200]);
      await splitter.rebalance(50, 0);
      await vault.withdraw(99, signer.address, signer.address,);
    });

    it("withdraw with slippage covering from insurance test", async () => {
      await strategy2.setSlippage(1);
      await vault.setFees(0, 1_000)
      await vault.withdraw(99, signer.address, signer.address,);
    });

    it("do hard work for strategy with positive profit", async () => {
      expect(await strategy2.totalAssets()).eq(100);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
      await strategy2.setLast(20, 10);
      await splitter.doHardWorkForStrategy(strategy2.address);
      expect(await splitter.strategyAPRHistoryLength(strategy2.address)).eq(4);
      expect(await splitter.strategiesAPRHistory(strategy2.address, 3)).above(3500_000);
      expect(await splitter.strategiesAPR(strategy2.address)).above(1000_000);
    });

    it("do hard work with positive profit", async () => {
      expect(await strategy2.totalAssets()).eq(100);
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
      await strategy2.setLast(20, 10);
      await splitter.doHardWork();
      expect(await splitter.strategyAPRHistoryLength(strategy2.address)).eq(4);
      expect(await splitter.strategiesAPRHistory(strategy2.address, 3)).above(3500_000);
      expect(await splitter.strategiesAPR(strategy2.address)).above(1000_000);
    });

    it("do hard work without assets test", async () => {
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
      expect(await strategy.totalAssets()).eq(0);
      await splitter.doHardWorkForStrategy(strategy.address);
      expect(await splitter.strategyAPRHistoryLength(strategy.address)).eq(3);
    });

    it("do hard work with zero earns test", async () => {
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
      expect(await strategy2.totalAssets()).eq(100);
      await splitter.doHardWorkForStrategy(strategy2.address);
      expect(await splitter.strategyAPRHistoryLength(strategy2.address)).eq(4);
    });

  });

});
