import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ControllerMinimal, IController__factory,
  MockGauge,
  MockGauge__factory,
  MockStrategyV3, MockStrategyV3__factory,
  MockToken,
  StrategySplitterV2,
  TetuVaultV2
} from "../../typechain";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";
import {expect} from "chai";

describe("StrategyBaseV3Tests", function () {
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
  let strategyAsSplitter: MockStrategyV3;

//region begin, after
  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    await usdc.transfer(signer2.address, parseUnits('1', 6));

    mockGauge = MockGauge__factory.connect(await DeployerUtils.deployProxy(signer, 'MockGauge'), signer);
    await mockGauge.init(controller.address)
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

    strategyAsSplitter = MockStrategyV3__factory.connect(
      (await DeployerUtils.deployProxy(signer, 'MockStrategyV3')),
      await Misc.impersonate(splitter.address)
    );

    const forwarder = await DeployerUtils.deployContract(signer, 'MockForwarder')
    await controller.setForwarder(forwarder.address);

    // initialize strategy
    await strategyAsSplitter.init(controller.address, splitter.address);
    await splitter.addStrategies([strategyAsSplitter.address], [100]);
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
//endregion begin, after

//region Unit tests

  it("set specific name", async () => {
    await strategyAsSplitter.connect(signer).setStrategySpecificName('New Name');
    expect(await strategyAsSplitter.strategySpecificName()).eq('New Name');
  });

  describe("performanceFee", () => {
    describe("Good paths", () => {
      it("should return default fee and governance as default receiver", async () => {
        const ret = [
          await strategyAsSplitter.performanceFee(),
          await strategyAsSplitter.performanceReceiver()
        ].join();
        const expected = [
          10_000, // strategyAsSplitter.DEFAULT_PERFORMANCE_FEE
          '0x9Cc199D4353b5FB3e6C8EEBC99f5139e0d8eA06b'
        ].join();
        expect(ret).eq(expected);
      });
      it("should return expected fee, receiver and ratio", async () => {
        const governance = await IController__factory.connect(await strategyAsSplitter.controller(), signer).governance();
        const receiver = ethers.Wallet.createRandom();
        await strategyAsSplitter.connect(await Misc.impersonate(governance)).setupPerformanceFee(5_000, receiver.address, 2);

        const ret = [
          await strategyAsSplitter.performanceFee(),
          await strategyAsSplitter.performanceReceiver(),
          await strategyAsSplitter.performanceFeeRatio(),
        ].join();
        const expected = [5_000, receiver.address, 2].join();
        expect(ret).eq(expected);
      });
    });
    describe("Bad paths", () => {
      it("should revert if not governance", async () => {
        const receiver = ethers.Wallet.createRandom();
        const notGovernance = ethers.Wallet.createRandom().address;
        await expect(
          strategyAsSplitter.connect(await Misc.impersonate(notGovernance)).setupPerformanceFee(5_000, receiver.address, 0)
        ).revertedWith("SB: Denied"); // DENIED
      });
      it("should revert if the fee is too high", async () => {
        const governance = await IController__factory.connect(await strategyAsSplitter.controller(), signer).governance();
        const receiver = ethers.Wallet.createRandom();
        await expect(
          strategyAsSplitter.connect(await Misc.impersonate(governance)).setupPerformanceFee(101_000, receiver.address, 0)
        ).revertedWith("SB: Too high"); // TOO_HIGH
      });
      it("should revert if the receiver is zero", async () => {
        const governance = await IController__factory.connect(await strategyAsSplitter.controller(), signer).governance();
        await expect(
          strategyAsSplitter.connect(await Misc.impersonate(governance)).setupPerformanceFee(10_000, Misc.ZERO_ADDRESS, 0)
        ).revertedWith("SB: Wrong value"); // WRONG_VALUE
      });
      it("should revert if the ratio is too high", async () => {
        const governance = await IController__factory.connect(await strategyAsSplitter.controller(), signer).governance();
        const receiver = ethers.Wallet.createRandom();
        await expect(
          strategyAsSplitter.connect(await Misc.impersonate(governance)).setupPerformanceFee(10_000, receiver.address, 101_000)
        ).revertedWith("SB: Too high"); // TOO_HIGH
      });
    });
  });
//endregion Unit tests
});
