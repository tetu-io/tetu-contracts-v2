import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {MockStakingToken, MockToken, MultiGauge, RewardsRedirector, VeTetu,} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {BigNumber} from "ethers";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

const FULL_AMOUNT = parseUnits('100');

describe("RewardsRedirectorTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let owner: SignerWithAddress;
  let rewarder: SignerWithAddress;
  let user: SignerWithAddress;
  let claimer: SignerWithAddress;

  let redirector: RewardsRedirector;
  let stakingToken: MockStakingToken;
  let stakingToken2: MockStakingToken;
  let tetu: MockToken;
  let rewardToken: MockToken;
  let rewardToken2: MockToken;
  let rewardTokenDefault: MockToken;
  let gauge: MultiGauge;
  let ve: VeTetu;


  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();
    [owner, rewarder, user, claimer] = await ethers.getSigners();

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

    redirector = await DeployerUtils.deployContract(owner, "RewardsRedirector", owner.address, gauge.address) as RewardsRedirector;
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

  it("set new gov", async () => {
    await expect(redirector.connect(user).offerOwnership(user.address)).revertedWith('!owner');
    await redirector.offerOwnership(user.address)
    await expect(redirector.acceptOwnership()).revertedWith('!owner');
    await redirector.connect(user).acceptOwnership()
    expect(await redirector.owner()).eq(user.address)
    await expect(redirector.offerOwnership(user.address)).revertedWith('!owner');
  })

  it("change operator test", async () => {
    expect((await redirector.getOperators())[0]).eq(owner.address);

    await redirector.changeOperator(user.address, true);
    await redirector.changeOperator(rewarder.address, true);

    expect((await redirector.getOperators())[1]).eq(user.address);
    expect((await redirector.getOperators())[2]).eq(rewarder.address);

    await redirector.changeOperator(user.address, false);
    expect((await redirector.getOperators())[1]).eq(rewarder.address);
  })

  it("change redirect test", async () => {
    expect((await redirector.getRedirected()).length).eq(0);

    await redirector.changeRedirected(user.address, [owner.address, rewarder.address], true);

    expect((await redirector.getRedirected())[0]).eq(user.address);
    expect((await redirector.getRedirectedVaults(user.address))[0]).eq(owner.address);
    expect((await redirector.getRedirectedVaults(user.address))[1]).eq(rewarder.address);

    await redirector.changeRedirected(user.address, [], false);
    expect((await redirector.getRedirected()).length).eq(0);
    expect((await redirector.getRedirectedVaults(user.address)).length).eq(0);
  })

  it("claim test", async () => {
    // add reward
    await gauge.notifyRewardAmount(stakingToken.address, rewardToken.address, parseUnits('1'));
    await gauge.registerRewardToken(stakingToken.address, rewardToken2.address);
    await gauge.notifyRewardAmount(stakingToken.address, rewardToken2.address, parseUnits('1'));

    // redirect
    await gauge.setRewardsRedirect(user.address, redirector.address);
    await redirector.changeRedirected(user.address, [stakingToken.address], true);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 4)

    expect(await rewardToken.balanceOf(user.address)).eq(0);
    expect(await rewardToken.balanceOf(redirector.address)).eq(0);

    await redirector.claimRewards()

    expect(await rewardToken.balanceOf(user.address)).eq(0);
    expect(await rewardToken.balanceOf(redirector.address)).not.eq(0);

    await redirector.changeOperator(claimer.address, true);
    expect(await rewardToken.balanceOf(claimer.address)).eq(0);
    await redirector.connect(claimer).withdraw(rewardToken.address);
    expect(await rewardToken.balanceOf(claimer.address)).not.eq(0);
  })
})
