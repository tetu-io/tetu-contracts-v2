import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ControllerMinimal, IERC20__factory,
  MockGauge,
  MockGauge__factory,
  MockStrategy, MockStrategy__factory,
  MockToken,
  StrategySplitterV2,
  TetuVaultV2
} from "../../typechain";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";
import {expect} from "chai";

describe("StrategyBaseV2Tests", function () {
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
  let strategyAsSplitter: MockStrategy;

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

    strategyAsSplitter = MockStrategy__factory.connect(
      (await DeployerUtils.deployProxy(signer, 'MockStrategy')),
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
  /**
   * Tests for modification of StrategyBaseV2.baseAmounts after investing/withdrawing any amount from/to the splitter
   */
  describe("baseAmounts modifications", () => {
    describe("investAll", () => {
      describe("Good paths", () => {
        it("should register invested amount", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);

          const ret = await strategyAsSplitter.baseAmounts(usdc.address);
          expect(ret).eq(amount);
        });
        it("should emit UpdateBaseAmounts", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsSplitter.address, amount);

          // todo Replace by await expect( after migration to hardhat-chai-matchers
          expect(await strategyAsSplitter.investAll(amount))
            .to.emit(strategyAsSplitter.address, "UpdateBaseAmounts")
            .withArgs(usdc.address, amount);
        });
      });
      describe("Bad paths", () => {
        it("should revert with WRONG_AMOUNT", async () => {
          const amount = parseUnits('1', 6);
          // (!) The amount is NOT transferred // await usdc.transfer(splitter.address, amount);
          await expect(strategyAsSplitter.investAll(amount))
            .revertedWith("SB: Wrong amount");
        });
      });
    });
    describe("withdrawToSplitter", () => {
      describe("Good paths", () => {
        it("should unregister invested amount, withdrawn amount == base amount", async () => {
          const amount = parseUnits('1', 6);
          const amountToWithdraw = parseUnits('0.3', 6);

          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);
          const before = await strategyAsSplitter.baseAmounts(usdc.address);
          await strategyAsSplitter.connect(await Misc.impersonate(splitter.address)).withdrawToSplitter(amountToWithdraw);
          const after = await strategyAsSplitter.baseAmounts(usdc.address);

          const ret = [
            +formatUnits(before, 6),
            +formatUnits(after, 6)
          ].join();
          const expected = [
            +formatUnits(amount, 6),
            +formatUnits(amount.sub(amountToWithdraw), 6)
          ].join();
          expect(ret).eq(expected);
        });
        it("should emit UpdateBaseAmounts, withdrawn amount == base amount", async () => {
          const amount = parseUnits('5.5', 6);
          const amountToWithdraw = parseUnits('5.5', 6);

          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);

          // todo Replace by await expect( after migration to hardhat-chai-matchers
          expect(await strategyAsSplitter.withdrawToSplitter(amountToWithdraw))
            .to.emit(strategyAsSplitter.address, "UpdateBaseAmounts")
            .withArgs(usdc.address, amountToWithdraw.mul(-1));
        });
      });
      describe("Bad paths", () => {
        it("should revert if withdrawn amount > base amount", async () => {
          const amount = parseUnits('1', 6);
          const amountToWithdraw = parseUnits('5.5', 6);
          const rewardsAmount = parseUnits('5', 6);
          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);

          // add "rewards" to the strategy
          // now, the total amount on strategy balance is more than the base amount
          await usdc.transfer(strategyAsSplitter.address, rewardsAmount);

          await expect(strategyAsSplitter.withdrawToSplitter(amountToWithdraw))
            .revertedWith("SB: Wrong amount");
        });
      });
    });
    describe("withdrawAllToSplitter", () => {
      describe("Good paths", () => {
        it("should unregister invested amount", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);
          const before = await strategyAsSplitter.baseAmounts(usdc.address);
          await strategyAsSplitter.connect(await Misc.impersonate(splitter.address)).withdrawAllToSplitter();
          const after = await strategyAsSplitter.baseAmounts(usdc.address);

          const ret = [
            +formatUnits(before, 6),
            +formatUnits(after, 6)
          ].join();
          const expected = [
            +formatUnits(amount, 6),
            +formatUnits(0, 6)
          ].join();
          expect(ret).eq(expected);
        });
        it("should emit UpdateBaseAmounts", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);
          // todo Replace by await expect( after migration to hardhat-chai-matchers
          expect(await strategyAsSplitter.withdrawAllToSplitter())
            .to.emit(strategyAsSplitter.address, "UpdateBaseAmounts")
            .withArgs(usdc.address, amount.mul(-1));
        });
        it("should unregister base amount when balance > base amount", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsSplitter.address, amount);
          await strategyAsSplitter.investAll(amount);

          // make the total amount on strategy balance more than the base amount (i.e. airdrops)
          const additionalAmount = parseUnits('777', 6);
          await usdc.transfer(strategyAsSplitter.address, additionalAmount);

          const before = await strategyAsSplitter.baseAmounts(usdc.address);
          await strategyAsSplitter.withdrawAllToSplitter();
          const baseAmountAfter = await strategyAsSplitter.baseAmounts(usdc.address);
          const balanceAfter = await usdc.balanceOf(strategyAsSplitter.address);

          const ret = [
            +formatUnits(before, 6),
            +formatUnits(baseAmountAfter, 6),
            +formatUnits(balanceAfter, 6),
          ].join();
          const expected = [
            +formatUnits(amount, 6),
            +formatUnits(0, 6),
            +formatUnits(additionalAmount, 6),
          ].join();
          expect(ret).eq(expected);
        });
      });
    });
  });

//endregion Unit tests
});