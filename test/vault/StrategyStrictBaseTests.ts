import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ERC4626Strict, MockStrategyStrict, MockStrategyStrict__factory,
  MockToken
} from "../../typechain";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";
import {expect} from "chai";

describe("StrategyStrictBaseTests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let usdc: MockToken;
  let tetu: MockToken;
  let vault: ERC4626Strict;
  let strategyAsVault: MockStrategyStrict;

//region begin, after
  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    await usdc.transfer(signer2.address, parseUnits('1', 6));
    const strategy = await DeployerUtils.deployContract(signer, 'MockStrategyStrict') as MockStrategyStrict;

    vault = await DeployerUtils.deployContract(
      signer,
      'ERC4626Strict',
      usdc.address,
      'USDC',
      'USDC',
      strategy.address,
      0) as ERC4626Strict;

    await strategy.init(vault.address);

    strategyAsVault = MockStrategyStrict__factory.connect(
      strategy.address,
      await Misc.impersonate(vault.address)
    );
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
          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);

          const ret = await strategyAsVault.baseAmounts(usdc.address);
          expect(ret).eq(amount);
        });
        it("should emit UpdateBaseAmounts", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsVault.address, amount);

          // todo Replace by await expect( after migration to hardhat-chai-matchers
          expect(await strategyAsVault.investAll(amount))
            .to.emit(strategyAsVault.address, "UpdateBaseAmounts")
            .withArgs(usdc.address, amount);
        });
      });
      describe("Bad paths", () => {
        it("should revert with WRONG_AMOUNT", async () => {
          const amount = parseUnits('1', 6);
          // (!) The amount is NOT transferred // await usdc.transfer(splitter.address, amount);
          await expect(strategyAsVault.investAll(amount))
            .revertedWith("SB: Wrong amount");
        });
      });
    });
    describe("withdrawToVault", () => {
      describe("Good paths", () => {
        it("should unregister invested amount, withdrawn amount == base amount", async () => {
          const amount = parseUnits('1', 6);
          const amountToWithdraw = parseUnits('0.3', 6);

          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);
          const before = await strategyAsVault.baseAmounts(usdc.address);
          await strategyAsVault.connect(await Misc.impersonate(vault.address)).withdrawToVault(amountToWithdraw);
          const after = await strategyAsVault.baseAmounts(usdc.address);

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

          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);

          // todo Replace by await expect( after migration to hardhat-chai-matchers
          expect(await strategyAsVault.withdrawToVault(amountToWithdraw))
            .to.emit(strategyAsVault.address, "UpdateBaseAmounts")
            .withArgs(usdc.address, amountToWithdraw.mul(-1));
        });
      });
      describe("Bad paths", () => {
        it("should revert if withdrawn amount > base amount", async () => {
          const amount = parseUnits('1', 6);
          const amountToWithdraw = parseUnits('5.5', 6);
          const rewardsAmount = parseUnits('5', 6);
          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);

          // add "rewards" to the strategy
          // now, the total amount on strategy balance is more than the base amount
          await usdc.transfer(strategyAsVault.address, rewardsAmount);

          await expect(strategyAsVault.withdrawToVault(amountToWithdraw))
            .revertedWith("SB: Wrong amount");
        });
      });
    });
    describe("withdrawAllToSplitter", () => {
      describe("Good paths", () => {
        it("should unregister invested amount", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);
          const before = await strategyAsVault.baseAmounts(usdc.address);
          await strategyAsVault.connect(await Misc.impersonate(vault.address)).withdrawAllToVault();
          const after = await strategyAsVault.baseAmounts(usdc.address);

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
          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);
          // todo Replace by await expect( after migration to hardhat-chai-matchers
          expect(await strategyAsVault.withdrawAllToVault())
            .to.emit(strategyAsVault.address, "UpdateBaseAmounts")
            .withArgs(usdc.address, amount.mul(-1));
        });
        it("should unregister base amount when balance > base amount", async () => {
          const amount = parseUnits('1', 6);
          await usdc.transfer(strategyAsVault.address, amount);
          await strategyAsVault.investAll(amount);

          // make the total amount on strategy balance more than the base amount (i.e. airdrops)
          const additionalAmount = parseUnits('777', 6);
          await usdc.transfer(strategyAsVault.address, additionalAmount);

          const before = await strategyAsVault.baseAmounts(usdc.address);
          await strategyAsVault.withdrawAllToVault();
          const baseAmountAfter = await strategyAsVault.baseAmounts(usdc.address);
          const balanceAfter = await usdc.balanceOf(strategyAsVault.address);

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