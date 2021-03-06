import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal,
  MockGauge,
  MockStrategy,
  MockStrategy__factory,
  MockStrategySimple,
  MockStrategySimple__factory,
  MockToken,
  StrategySplitterV2,
  TetuVaultV2
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Splitter and base strategy tests", function () {
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

    strategy = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer);

    const forwarder = await DeployerUtils.deployContract(signer, 'MockForwarder')
    await controller.setForwarder(forwarder.address);


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
    await strategy.init(controller.address, splitter.address);
    await expect(splitter.connect(signer2).addStrategies([strategy.address], [100])).revertedWith("SS: Denied");
  });

  it("set strategy test", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [100]);
    expect((await splitter.allStrategies()).length).eq(1);
  });

  it("set strategy with time lock test", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [100]);

    const strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
    await strategy2.init(controller.address, splitter.address);

    await splitter.scheduleStrategies([strategy2.address]);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await splitter.addStrategies([strategy2.address], [100]);
    expect((await splitter.allStrategies()).length).eq(2);
  });

  it("schedule strategy test", async () => {
    await splitter.scheduleStrategies([signer.address]);
    const data = await splitter.scheduledStrategies();
    expect(data._strategies[0]).eq(signer.address);
    expect(data.locks[0]).above(0);
  });

  it("schedule strategy twice revert", async () => {
    await splitter.scheduleStrategies([signer.address]);
    await expect(splitter.scheduleStrategies([signer.address])).revertedWith('SS: Exist');
  });

  it("schedule strategy remove test", async () => {
    await splitter.scheduleStrategies([signer.address]);
    let data = await splitter.scheduledStrategies();
    expect(data._strategies[0]).eq(signer.address);
    expect(data.locks[0]).above(0);
    await splitter.removeScheduledStrategies([signer.address]);
    data = await splitter.scheduledStrategies();
    expect(data._strategies.length).eq(0);
    expect(data.locks.length).eq(0);
  });

  it("schedule strategy remove not exist revert", async () => {
    await expect(splitter.removeScheduledStrategies([signer.address])).revertedWith('SS: Not exist');
  });

  it("set strategy wrong asset revert", async () => {
    const s = MockStrategySimple__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategySimple')), signer)
    await s.init(controller.address, splitter.address, tetu.address);
    await expect(splitter.addStrategies([s.address], [100])).revertedWith("SS: Wrong asset");
  });

  it("set strategy wrong splitter revert", async () => {
    const s = MockStrategySimple__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategySimple')), signer)
    await s.init(controller.address, tetu.address, usdc.address);
    await expect(splitter.addStrategies([s.address], [100])).revertedWith("SS: Wrong splitter");
  });

  it("set strategy wrong controller revert", async () => {
    const s = MockStrategySimple__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategySimple')), signer)
    const c = await DeployerUtils.deployMockController(signer);
    await s.init(c.address, splitter.address, usdc.address);
    await expect(splitter.addStrategies([s.address], [100])).revertedWith("SS: Wrong controller");
  });

  it("set strategy already exist revert", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [100]);
    await expect(splitter.addStrategies([strategy.address], [100])).revertedWith("SS: Already exist");
  });

  it("set strategy wrong proxy revert", async () => {
    const s = await DeployerUtils.deployContract(signer, 'MockStrategy');
    await s.init(controller.address, splitter.address);
    await expect(splitter.addStrategies([s.address], [100])).revertedWith("");
  });

  it("set strategy duplicate revert", async () => {
    await strategy.init(controller.address, splitter.address);
    await expect(splitter.addStrategies([strategy.address, strategy.address], [100, 100])).revertedWith("SS: Duplicate");
  });

  it("set strategy time lock revert", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [100])
    const strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
    await strategy2.init(controller.address, splitter.address);
    await expect(splitter.addStrategies([strategy2.address], [100])).revertedWith("SS: Time lock");
  });

  it("remove strategy denied revert", async () => {
    await expect(splitter.connect(signer2).removeStrategies([strategy.address])).revertedWith("SS: Denied");
  });

  it("remove strategy test", async () => {
    await strategy.init(controller.address, splitter.address);
    const strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
    await strategy2.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [100, 100]);
    expect((await splitter.allStrategies()).length).eq(2);
    await splitter.removeStrategies([strategy.address]);
    expect((await splitter.allStrategies()).length).eq(1);
  });

  it("remove strategy empty revert", async () => {
    await strategy.init(controller.address, splitter.address);
    await expect(splitter.removeStrategies([strategy.address])).revertedWith("SS: Empty strategies");
  });

  it("remove strategy test", async () => {
    await strategy.init(controller.address, splitter.address);
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
    await strategy.init(controller.address, splitter.address);
    const strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
    await strategy2.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [100, 100]);
    await expect(splitter.rebalance(1000, 1)).revertedWith("SS: Percent");
  });

  it("rebalance no liq revert", async () => {
    await strategy.init(controller.address, splitter.address);
    const strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
    await strategy2.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address, strategy2.address], [100, 100]);
    await expect(splitter.rebalance(1, 1)).revertedWith("SS: No strategies");
  });

  it("rebalance test", async () => {
    await strategy.init(controller.address, splitter.address);
    const strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
    await strategy2.init(controller.address, splitter.address);
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
    await expect(splitter.connect(signer2).doHardWorkForStrategy(strategy.address, true)).revertedWith("SS: Denied");
  });

  it("apr test", async () => {
    expect(await splitter.computeApr(100, 10, 60 * 60 * 24 * 365)).eq(10_000);
    expect(await splitter.computeApr(100, 10, 60 * 60 * 24)).eq(3650_000);
    expect(await splitter.computeApr(parseUnits('1234'), parseUnits('0.05'), 60 * 60 * 24)).eq(1_478);
    expect(await splitter.computeApr(0, 100, 60 * 60 * 24)).eq(0);
    expect(await splitter.computeApr(100, 100, 0)).eq(0);
  });

  it("remove last strategy test", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [50]);
    await splitter.removeStrategies([strategy.address])
    expect(await splitter.strategiesLength()).eq(0);
  });

  it("pause/continue investing test", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [50]);
    await splitter.pauseInvesting(strategy.address);
    expect(await splitter.pausedStrategies(strategy.address)).eq(true);
    expect(await splitter.strategiesAPR(strategy.address)).eq(0);
    await splitter.continueInvesting(strategy.address, 100);
    expect(await splitter.pausedStrategies(strategy.address)).eq(false);
    expect(await splitter.strategiesAPR(strategy.address)).eq(100);
  });

  it("continue investing not paused revert", async () => {
    await expect(splitter.continueInvesting(strategy.address, 100)).revertedWith('SS: Not paused');
  });

  it("invest to paused revert", async () => {
    await strategy.init(controller.address, splitter.address);
    await splitter.addStrategies([strategy.address], [50]);
    await splitter.pauseInvesting(strategy.address);
    await expect(vault.deposit(100, signer.address)).revertedWith('SS: Paused');
  });

  describe("with 3 strategies and assets by default", function () {

    let snapshotBefore2: string;
    let strategy2: MockStrategy;
    let strategy3: MockStrategy;

    before(async function () {
      snapshotBefore2 = await TimeUtils.snapshot();
      await strategy.init(controller.address, splitter.address);
      strategy2 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
      await strategy2.init(controller.address, splitter.address);
      strategy3 = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer)
      await strategy3.init(controller.address, splitter.address);
      await splitter.addStrategies([strategy.address, strategy2.address, strategy3.address], [50, 100, 1]);

      await vault.deposit(100, signer.address);
    });

    after(async function () {
      await TimeUtils.rollback(snapshotBefore2);
    });

    it("maxCheapWithdraw test", async () => {
      expect(await splitter.maxCheapWithdraw()).eq(100);
    });

    it("remove strategy test", async () => {
      await splitter.removeStrategies([strategy.address])
      expect(await splitter.strategiesLength()).eq(2);
    });

    it("set apr paused revert", async () => {
      await splitter.pauseInvesting(strategy.address)
      await expect(splitter.setAPRs([strategy.address], [200])).revertedWith('SS: Paused');
    });

    it("rebalance slippage withdraw revert", async () => {
      await splitter.setAPRs([strategy.address], [200]);
      await strategy2.setSlippage(10);
      await expect(splitter.rebalance(100, 9_999)).revertedWith('SS: Slippage withdraw');
    });

    it("rebalance slippage deposit revert", async () => {
      await splitter.setAPRs([strategy.address], [200]);
      await strategy.setSlippageDeposit(10);
      await expect(splitter.rebalance(100, 9_999)).revertedWith('SS: Slippage deposit');
    });

    it("rebalance pause revert", async () => {
      await splitter.pauseInvesting(strategy.address);
      await splitter.pauseInvesting(strategy2.address);
      await splitter.pauseInvesting(strategy3.address);
      await expect(splitter.rebalance(100, 0)).revertedWith('SS: Paused');
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
      await splitter.doHardWorkForStrategy(strategy.address, true);
    });

    it("withdraw all with balance on splitter test", async () => {
      await strategy2.emergencyExit();
      await vault.withdrawAll();
    });

    it("withdraw part with balance on splitter test", async () => {
      await strategy2.emergencyExit();
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
      await splitter.doHardWorkForStrategy(strategy2.address, true);
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
      await splitter.doHardWorkForStrategy(strategy.address, true);
      expect(await splitter.strategyAPRHistoryLength(strategy.address)).eq(3);
    });

    it("do hard work with zero earns test", async () => {
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
      expect(await strategy2.totalAssets()).eq(100);
      await splitter.doHardWorkForStrategy(strategy2.address, true);
      expect(await splitter.strategyAPRHistoryLength(strategy2.address)).eq(4);
    });

    it("deposit with loss without covering", async () => {
      expect(await vault.sharePrice()).eq(1000000);
      await strategy2.setSlippageDeposit(50);
      await vault.deposit(1000, signer.address);
      expect(await vault.totalAssets()).eq(600);
      expect(await vault.sharePrice()).eq(545454);
    });

    it("deposit with loss with covering", async () => {
      expect(await vault.sharePrice()).eq(1000000);
      await strategy2.setSlippageDeposit(1);
      await vault.setFees(1_000, 0);
      await vault.deposit(1000, signer.address);
      expect(await vault.sharePrice()).eq(1000000);
      expect(await vault.totalAssets()).eq(1090);
    });

    it("hardwork with loss with covering", async () => {
      expect(await vault.sharePrice()).eq(1000000);
      await strategy2.setSlippageHardWork(1);
      await vault.setFees(1_000, 0);
      await vault.deposit(1000, signer.address);
      await splitter.doHardWorkForStrategy(strategy2.address, true);
      expect(await vault.sharePrice()).eq(1000000);
      expect(await vault.totalAssets()).eq(1090);
    });

    it("hardwork with loss without covering", async () => {
      expect(await vault.sharePrice()).eq(1000000);
      await strategy2.setSlippageHardWork(100);
      await vault.deposit(1000, signer.address);
      await splitter.doHardWorkForStrategy(strategy2.address, true);
      expect(await vault.sharePrice()).eq(900000);
      expect(await vault.totalAssets()).eq(990);
    });

    it("rebalance with loss without covering", async () => {
      expect(await vault.sharePrice()).eq(1000000);
      await splitter.setAPRs([strategy.address], [200]);

      await vault.deposit(1000, signer.address);

      await strategy.setSlippageDeposit(1);

      await splitter.rebalance(100, 1_000);

      expect(await vault.sharePrice()).eq(999090);
      expect(await vault.totalAssets()).eq(1099);
    });

    it("rebalance with loss with covering", async () => {
      expect(await vault.sharePrice()).eq(1000000);
      await splitter.setAPRs([strategy.address], [200]);

      await vault.setFees(1_000, 0);
      await vault.deposit(1000, signer.address);

      await strategy.setSlippageDeposit(1);

      await splitter.rebalance(100, 1_000);

      expect(await vault.sharePrice()).eq(1000000);
      expect(await vault.totalAssets()).eq(1090);
    });

  });


  // **************** strategy base tests

  it("strategy init wrong controller revert", async () => {
    const c = await DeployerUtils.deployMockController(signer);
    await expect(strategy.init(c.address, splitter.address)).revertedWith("SB: Wrong controller");
  });

  describe("with inited strategy", function () {

    let snapshotBefore3: string;

    before(async function () {
      snapshotBefore3 = await TimeUtils.snapshot();
      await strategy.init(controller.address, splitter.address);
    });

    after(async function () {
      await TimeUtils.rollback(snapshotBefore3);
    });

    it("emergency exit from 3d party revert", async () => {
      await expect(strategy.connect(signer2).emergencyExit()).revertedWith("SB: Denied");
    });

    it("strategy withdraw all from 3rd party revert", async () => {
      await expect(strategy.withdrawAllToSplitter()).revertedWith("SB: Denied");
    });

    it("strategy withdraw from 3rd party revert", async () => {
      await expect(strategy.withdrawToSplitter(0)).revertedWith("SB: Denied");
    });

    it("strategy invest from 3rd party revert", async () => {
      await expect(strategy.investAll()).revertedWith("SB: Denied");
    });

    it("claim from 3d party revert", async () => {
      await expect(strategy.connect(signer2).claim()).revertedWith("SB: Denied");
    });

    it("claim test", async () => {
      await strategy.claim();
    });

    it("invest all with zero balance test", async () => {
      await strategy.connect(await Misc.impersonate(splitter.address)).investAll();
    });

    it("withdraw to splitter when enough balance test", async () => {
      await usdc.transfer(strategy.address, parseUnits('1', 6));
      await strategy.connect(await Misc.impersonate(splitter.address)).withdrawToSplitter(parseUnits('1', 6));
    });

    it("set compound ratio test", async () => {
      await controller.setPlatformVoter(signer.address);
      await strategy.setCompoundRatio(100);
    });

    it("set compound ratio from not voter revert", async () => {
      await expect(strategy.setCompoundRatio(100)).revertedWith("SB: Denied");
    });

    it("set compound ratio too high revert", async () => {
      await controller.setPlatformVoter(signer.address);
      await expect(strategy.setCompoundRatio(1000000)).revertedWith("SB: Too high");
    });

  });

});
