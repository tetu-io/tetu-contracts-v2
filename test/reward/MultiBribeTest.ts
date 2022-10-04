import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {InterfaceIds, MockToken, MultiBribe, TetuVoter, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";


const {expect} = chai;

const LOCK_PERIOD = 60 * 60 * 24 * 365;

describe("multi bribe tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let rewarder: SignerWithAddress;

  let tetu: MockToken;
  let rewardToken: MockToken;
  let rewardToken2: MockToken;
  let bribe: MultiBribe;
  let ve: VeTetu;
  let voter: TetuVoter;
  let vault: MockToken;
  let vault2: MockToken;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, user, rewarder] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    const controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    rewardToken = await DeployerUtils.deployMockToken(owner, 'REWARD', 18);
    rewardToken = await DeployerUtils.deployMockToken(owner, 'REWARD', 18);
    await rewardToken.mint(rewarder.address, BigNumber.from(Misc.MAX_UINT).sub(parseUnits('1000000')));
    rewardToken2 = await DeployerUtils.deployMockToken(owner, 'REWARD2', 18);
    await rewardToken2.mint(rewarder.address, parseUnits('100'));

    const gauge = await DeployerUtils.deployMultiGauge(
      owner,
      controller.address,
      owner.address,
      ve.address,
      tetu.address
    );

    bribe = await DeployerUtils.deployMultiBribe(
      owner,
      controller.address,
      owner.address,
      ve.address,
      tetu.address,
    );

    voter = await DeployerUtils.deployTetuVoter(
      owner,
      controller.address,
      ve.address,
      tetu.address,
      gauge.address,
      bribe.address
    );
    await controller.setVoter(voter.address);

    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.approve(bribe.address, Misc.MAX_UINT);
    await tetu.connect(user).approve(ve.address, Misc.MAX_UINT);
    await tetu.mint(user.address, parseUnits('1'));

    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(user).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

    // *** vaults

    vault = await DeployerUtils.deployMockToken(owner, 'VAULT', 18);
    vault2 = await DeployerUtils.deployMockToken(owner, 'VAULT2', 6);
    await controller.addVault(vault.address);
    await controller.addVault(vault2.address);

    await voter.vote(1, [vault.address], [100]);
    await voter.connect(user).vote(2, [vault.address], [100]);

    await rewardToken.approve(bribe.address, Misc.MAX_UINT);
    await rewardToken2.approve(bribe.address, Misc.MAX_UINT);
    await rewardToken.connect(rewarder).approve(bribe.address, Misc.MAX_UINT);
    await rewardToken2.connect(rewarder).approve(bribe.address, Misc.MAX_UINT);
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

  it("wrong convert test", async function () {
    await expect(bribe.tokenIdToAddress(Misc.MAX_UINT)).revertedWith('Wrong convert')
  });

  it("supports interface", async function () {
    expect(await bribe.supportsInterface('0x00000000')).eq(false);
    const interfaceIds = await DeployerUtils.deployContract(owner, 'InterfaceIds') as InterfaceIds;
    expect(await bribe.supportsInterface(await interfaceIds.I_MULTI_POOL())).eq(true);
  });

  // ************* STAKING TOKEN

  it("is staking token test", async function () {
    expect(await bribe.isStakeToken(vault.address)).eq(true);
  });

  // ************* deposit/withdraw/balance

  it("balance test", async function () {
    expect(await bribe.balanceOf(vault.address, await bribe.tokenIdToAddress(1))).above(parseUnits('0.98'));
  });
  it("balance after vote reset test", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7);
    await voter.reset(1);
    expect(await bribe.balanceOf(vault.address, await bribe.tokenIdToAddress(1))).eq(0);
  });

  it("deposit should revert for not voter", async function () {
    await expect(bribe.deposit(vault.address, 1, 1)).revertedWith("Not voter");
  });

  it("withdraw should revert for not voter", async function () {
    await expect(bribe.withdraw(vault.address, 1, 1)).revertedWith("Not voter");
  });

  // ************* REWARDS

  it("notify test", async function () {
    // make sure that gauge is empty
    expect(await rewardToken.balanceOf(bribe.address)).eq(0);
    expect(await bribe.rewardRate(vault.address, rewardToken.address)).eq(0);
    await bribe.registerRewardToken(vault.address, rewardToken.address);

    // add reward
    await bribe.notifyRewardAmount(vault.address, rewardToken.address, parseUnits('1'));

    // check that all metrics are fine
    expect(await rewardToken.balanceOf(bribe.address)).eq(parseUnits('1'));
    expect(+formatUnits(await bribe.rewardRate(vault.address, rewardToken.address), 36) * 60 * 60 * 24 * 7).eq(1);
    expect(await bribe.left(vault.address, rewardToken.address)).eq(parseUnits('1').sub(1));

    // make sure that for second reward everything empty
    expect(await rewardToken2.balanceOf(bribe.address)).eq(0);
    expect(await bribe.rewardRate(vault.address, rewardToken2.address)).eq(0);

    // add second reward
    await bribe.registerRewardToken(vault.address, rewardToken2.address);
    await bribe.notifyRewardAmount(vault.address, rewardToken2.address, parseUnits('10'));

    // check second reward metrics
    expect(await rewardToken2.balanceOf(bribe.address)).eq(parseUnits('10'));
    expect((+formatUnits(await bribe.rewardRate(vault.address, rewardToken2.address), 36) * 60 * 60 * 24 * 7).toFixed(0)).eq('10');
    expect(await bribe.left(vault.address, rewardToken2.address)).eq(parseUnits('10').sub(1));
  });

  it("claim test", async function () {
    // add reward
    await bribe.notifyRewardAmount(vault.address, tetu.address, parseUnits('1'));
    await bribe.registerRewardToken(vault.address, rewardToken2.address);
    await bribe.notifyRewardAmount(vault.address, rewardToken2.address, parseUnits('1'));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 4)

    expect(await tetu.balanceOf(user.address)).eq(0);
    await bribe.getAllRewardsForTokens([vault.address], 1);
    await bribe.getAllRewards(vault.address, 2);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 4)

    await bribe.getAllRewardsForTokens([vault.address], 1);
    await bribe.getReward(vault.address, 2, [tetu.address, rewardToken2.address]);

    expect(await tetu.balanceOf(user.address)).above(parseUnits('0.49'));
    expect(await rewardToken2.balanceOf(user.address)).above(parseUnits('0.49'));
    // some dust
    expect(await tetu.balanceOf(bribe.address)).below(10);
    expect(await rewardToken2.balanceOf(bribe.address)).below(10);
  });

});
