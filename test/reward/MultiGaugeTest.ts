import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {MockStakingToken, MockToken, MultiGauge, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";


const {expect} = chai;

const FULL_AMOUNT = parseUnits('100');
const LOCK_PERIOD = 60 * 60 * 24 * 90;

describe("multi gauge tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let rewarder: SignerWithAddress;

  let stakingToken: MockStakingToken;
  let stakingToken2: MockStakingToken;
  let tetu: MockToken;
  let rewardToken: MockToken;
  let rewardToken2: MockToken;
  let rewardTokenDefault: MockToken;
  let gauge: MultiGauge;
  let ve: VeTetu;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, user, rewarder] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    const controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);
    const voter = await DeployerUtils.deployMockVoter(owner, ve.address);
    await controller.setVoter(voter.address);

    rewardToken = await DeployerUtils.deployMockToken(owner, 'REWARD', 18);
    rewardToken = await DeployerUtils.deployMockToken(owner, 'REWARD', 18);
    await rewardToken.mint(rewarder.address, BigNumber.from(Misc.MAX_UINT).sub(parseUnits('1000000')));
    rewardToken2 = await DeployerUtils.deployMockToken(owner, 'REWARD2', 18);
    await rewardToken2.mint(rewarder.address, parseUnits('100'));
    rewardTokenDefault = await DeployerUtils.deployMockToken(owner, 'REWARD_DEFAULT', 18);
    await rewardTokenDefault.mint(rewarder.address, parseUnits('100'));

    gauge = await DeployerUtils.deployMultiGauge(
      owner,
      controller.address,
      ve.address,
      rewardTokenDefault.address,
    );

    stakingToken = await DeployerUtils.deployMockStakingToken(owner, gauge.address, 'VAULT', 18);
    stakingToken2 = await DeployerUtils.deployMockStakingToken(owner, gauge.address, 'VAULT2', 18);

    await gauge.addStakingToken(stakingToken.address);
    await gauge.registerRewardToken(stakingToken.address, rewardToken.address);

    await stakingToken.mint(owner.address, FULL_AMOUNT);
    await stakingToken.mint(user.address, FULL_AMOUNT);

    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(user).approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(rewarder).approve(ve.address, Misc.MAX_UINT);
    await rewardToken.approve(gauge.address, Misc.MAX_UINT);
    await rewardToken2.approve(gauge.address, Misc.MAX_UINT);
    await rewardTokenDefault.approve(gauge.address, Misc.MAX_UINT);
    await rewardToken.connect(rewarder).approve(gauge.address, Misc.MAX_UINT);
    await rewardToken2.connect(rewarder).approve(gauge.address, Misc.MAX_UINT);
    await rewardTokenDefault.connect(rewarder).approve(gauge.address, Misc.MAX_UINT);
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

  // ************* STAKING TOKEN

  it("add staking token from not operator revert", async function () {
    await expect(gauge.connect(user).addStakingToken(rewardToken2.address)).revertedWith('Not allowed');
  });

  it("is staking token test", async function () {
    expect(await gauge.isStakeToken(stakingToken.address)).eq(true);
  });

  // ************* deposit/withdraw/balance

  it("balance test", async function () {
    expect(await gauge.balanceOf(stakingToken.address, owner.address)).eq(parseUnits('100'));
    expect(await gauge.balanceOf(stakingToken.address, user.address)).eq(FULL_AMOUNT);

    await stakingToken.mint(owner.address, parseUnits('1'));
    expect(await gauge.balanceOf(stakingToken.address, owner.address)).eq(parseUnits('101'));

    await stakingToken.transfer(user.address, parseUnits('10'));
    expect(await gauge.balanceOf(stakingToken.address, owner.address)).eq(parseUnits('91'));
    expect(await gauge.balanceOf(stakingToken.address, user.address)).eq(FULL_AMOUNT.add(parseUnits('10')));
  });

  it("balance two tokens test", async function () {
    expect(await gauge.balanceOf(stakingToken.address, owner.address)).eq(parseUnits('100'));
    expect(await gauge.balanceOf(stakingToken.address, user.address)).eq(FULL_AMOUNT);

    await gauge.addStakingToken(stakingToken2.address);

    await stakingToken2.mint(owner.address, parseUnits('1'));
    expect(await gauge.balanceOf(stakingToken2.address, owner.address)).eq(parseUnits('1'));
    expect(await gauge.balanceOf(stakingToken.address, owner.address)).eq(parseUnits('100'));

    await stakingToken2.transfer(user.address, parseUnits('1'));
    expect(await gauge.balanceOf(stakingToken2.address, owner.address)).eq(0);
    expect(await gauge.balanceOf(stakingToken2.address, user.address)).eq(parseUnits('1'));

    expect(await gauge.balanceOf(stakingToken.address, owner.address)).eq(parseUnits('100'));
    expect(await gauge.balanceOf(stakingToken.address, user.address)).eq(FULL_AMOUNT);
  });

  it("handleBalanceChange should revert for non staking token", async function () {
    await expect(gauge.handleBalanceChange(owner.address)).revertedWith("Wrong staking token");
  });

  // ************* ATTACH/DETACH

  it("attach/detach test", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await gauge.attachVe(stakingToken.address, owner.address, 1)
    expect(await ve.attachments(1)).eq(1);
    await gauge.detachVe(stakingToken.address, owner.address, 1)
    expect(await ve.attachments(1)).eq(0);
  });

  it("attach and full withdraw test", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await gauge.attachVe(stakingToken.address, owner.address, 1)
    expect(await ve.attachments(1)).eq(1);
    await stakingToken.transfer(user.address, FULL_AMOUNT);
    expect(await ve.attachments(1)).eq(0);
  });

  it("attach for not owner revert", async function () {
    await expect(gauge.attachVe(stakingToken.address, owner.address, 0)).revertedWith("Not ve token owner");
  });

  it("attach for wrong token revert", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await expect(gauge.attachVe(rewardToken2.address, owner.address, 1)).revertedWith("Wrong staking token");
  });

  it("attach for wrong ve revert", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await gauge.attachVe(stakingToken.address, owner.address, 1);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await expect(gauge.attachVe(stakingToken.address, owner.address, 2)).revertedWith("Wrong ve");
  });

  it("detach for not owner revert", async function () {
    await expect(gauge.detachVe(stakingToken.address, owner.address, 0)).revertedWith("Not ve token owner");
  });

  it("detach for wrong token revert", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await expect(gauge.detachVe(rewardToken2.address, owner.address, 1)).revertedWith("Wrong staking token");
  });

  it("detach for wrong ve revert", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await gauge.attachVe(stakingToken.address, owner.address, 1);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await expect(gauge.detachVe(stakingToken.address, owner.address, 2)).revertedWith("Wrong ve");
  });

  // ************* REWARDS

  it("notify test", async function () {
    // make sure that gauge is empty
    expect(await rewardToken.balanceOf(gauge.address)).eq(0);
    expect(await gauge.rewardRate(stakingToken.address, rewardToken.address)).eq(0);

    // add reward
    await gauge.notifyRewardAmount(stakingToken.address, rewardTokenDefault.address, parseUnits('1'));
    await gauge.notifyRewardAmount(stakingToken.address, rewardToken.address, parseUnits('1'));

    // check that all metrics are fine
    expect(await rewardToken.balanceOf(gauge.address)).eq(parseUnits('1'));
    expect(+formatUnits(await gauge.rewardRate(stakingToken.address, rewardToken.address), 36) * 60 * 60 * 24 * 7).eq(1);
    expect(await gauge.left(stakingToken.address, rewardToken.address)).eq(parseUnits('1').sub(1));

    // make sure that for second reward everything empty
    expect(await rewardToken2.balanceOf(gauge.address)).eq(0);
    expect(await gauge.rewardRate(stakingToken.address, rewardToken2.address)).eq(0);

    // add second reward
    await gauge.registerRewardToken(stakingToken.address, rewardToken2.address);
    await gauge.notifyRewardAmount(stakingToken.address, rewardToken2.address, parseUnits('10'));

    // check second reward metrics
    expect(await rewardToken2.balanceOf(gauge.address)).eq(parseUnits('10'));
    expect((+formatUnits(await gauge.rewardRate(stakingToken.address, rewardToken2.address), 36) * 60 * 60 * 24 * 7).toFixed(0)).eq('10');
    expect(await gauge.left(stakingToken.address, rewardToken2.address)).eq(parseUnits('10').sub(1));
  });

  it("claim test", async function () {
    // add reward
    await gauge.notifyRewardAmount(stakingToken.address, rewardToken.address, parseUnits('1'));
    await gauge.registerRewardToken(stakingToken.address, rewardToken2.address);
    await gauge.notifyRewardAmount(stakingToken.address, rewardToken2.address, parseUnits('1'));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 4)

    expect(await rewardToken.balanceOf(user.address)).eq(0);
    await gauge.getAllRewardsForTokens([stakingToken.address], owner.address);
    await gauge.connect(user).getAllRewards(stakingToken.address, user.address);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 4)

    await gauge.getAllRewardsForTokens([stakingToken.address], owner.address);
    await gauge.connect(user).getReward(stakingToken.address, user.address, [rewardToken.address, rewardToken2.address]);

    expect(await rewardToken.balanceOf(user.address)).eq(parseUnits('0.5').sub(80));
    expect(await rewardToken2.balanceOf(user.address)).eq(parseUnits('0.5').sub(80));
    // some dust
    expect(await rewardToken.balanceOf(gauge.address)).eq(160);
    expect(await rewardToken2.balanceOf(gauge.address)).eq(160);
  });

});
