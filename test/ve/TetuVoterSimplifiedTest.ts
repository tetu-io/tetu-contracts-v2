import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  InterfaceIds, MockLiquidator,
  MockPawnshop,
  MockStakingToken,
  MockToken, MockVault,
  MultiGaugeNoBoost,
  TetuVoterSimplified
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 16 * WEEK;

describe("Tetu voter simplified tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tetu: MockToken;
  let underlying2: MockToken;

  let voter: TetuVoterSimplified;
  let gauge: MultiGaugeNoBoost;

  let vault: MockVault;
  let vault2: MockVault;
  let stakingToken: MockStakingToken;
  let pawnshop: MockPawnshop;
  let liquidator: MockLiquidator;

  let strategy1: string;
  let strategy2: string;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    underlying2 = await DeployerUtils.deployMockToken(owner, 'UNDERLYING2', 6);
    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    liquidator = await DeployerUtils.deployContract(owner, 'MockLiquidator') as MockLiquidator;
    const controller = await DeployerUtils.deployMockController(owner);
    await controller.setLiquidator(liquidator.address);

    gauge = await DeployerUtils.deployMultiGaugeNoBoost(
      owner,
      controller.address,
      tetu.address
    );

    voter = await DeployerUtils.deployTetuVoterSimplified(
      owner,
      controller.address,
      tetu.address,
      gauge.address,
    );

    await controller.setVoter(voter.address);


    await tetu.mint(owner2.address, parseUnits('100'));

    // *** vaults
    strategy1 = ethers.Wallet.createRandom().address;
    strategy2 = ethers.Wallet.createRandom().address;

    vault = await DeployerUtils.deployMockVault(owner, controller.address, underlying2.address, "VAULT",  strategy1, 0);
    vault2 = await DeployerUtils.deployMockVault(owner, controller.address, underlying2.address, "VAULT2", strategy2, 0);
    await controller.addVault(vault.address);
    await controller.addVault(vault2.address);

    stakingToken = await DeployerUtils.deployMockStakingToken(owner, gauge.address, 'VAULT', 18);
    await gauge.addStakingToken(stakingToken.address);

    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await liquidator.setPrice(1);
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

  it("is vault test", async function () {
    expect(await voter.isVault(vault.address)).eq(true)
    expect(await voter.isVault(owner.address)).eq(false)
  });

  it("valid vaults test", async function () {
    expect(await voter.validVaults(0)).eq(vault.address)
  });

  it("voted vault length test", async function () {
    expect(await voter.votedVaultsLength(0)).eq(0)
  });

  it("valid vaults length test", async function () {
    expect(await voter.validVaultsLength()).eq(2)
  });

  // *** NOTIFY
  describe("notifyRewardAmount", () => {
    it("notify zero amount revert test", async function () {
      await tetu.approve(voter.address, Misc.MAX_UINT);

      await expect(voter.notifyRewardAmount(0)).revertedWith("zero amount");
    });

    it("should send all rewards to vaults", async function () {
      await tetu.approve(voter.address, Misc.MAX_UINT);

      const balanceBefore = await tetu.balanceOf(voter.address);
      await voter.notifyRewardAmount(parseUnits('100'), {gasLimit: 9_000_000});
      const balanceAfter = await tetu.balanceOf(voter.address);

      expect(balanceBefore).eq(0);
      expect(balanceAfter).eq(0);
    });

    it("should try to send all rewards to vaults but keep them on balance", async function () {
      await tetu.approve(voter.address, Misc.MAX_UINT);

      // set StakelessMultiPoolBase.periodFinish
      await voter.notifyRewardAmount(100, {gasLimit: 9_000_000});

      // prepare total assets. Sum TVL will be 1+100
      // ratio will be 1/100 and 99/100
      // as result, it should produce exception "Amount should be higher than remaining rewards"
      // inside StakelessMultiPoolBase
      await underlying2.mint(strategy1, parseUnits("1"));
      await underlying2.mint(strategy2, parseUnits("100"));
      await liquidator.setPrice(1);
      await liquidator.setUseTokensToCalculatePrice(true);

      // The app should try to transfer rewards to vaults, revert the transferring and keep the rewards on balance
      const balanceBefore = await tetu.balanceOf(voter.address);
      await voter.notifyRewardAmount(200, {gasLimit: 9_000_000});
      const balanceAfter = await tetu.balanceOf(voter.address);

      expect(balanceAfter).gt(balanceBefore);
    });
  });

  // *** UPDATE


  it("supports interface", async function () {
    expect(await voter.supportsInterface('0x00000000')).eq(false);
    const interfaceIds = await DeployerUtils.deployContract(owner, 'InterfaceIds') as InterfaceIds;
    expect(await voter.supportsInterface(await interfaceIds.I_VOTER())).eq(true);
  });
});
