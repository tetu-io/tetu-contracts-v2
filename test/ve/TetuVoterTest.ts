import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  MockPawnshop,
  MockStakingToken,
  MockToken,
  MultiBribe,
  MultiGauge,
  TetuVoter,
  VeTetu
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 365;

describe("Tetu voter tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tetu: MockToken;
  let underlying2: MockToken;

  let ve: VeTetu;
  let voter: TetuVoter;
  let gauge: MultiGauge;
  let bribe: MultiBribe;

  let vault: MockToken;
  let vault2: MockToken;
  let stakingToken: MockStakingToken;
  let pawnshop: MockPawnshop;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    underlying2 = await DeployerUtils.deployMockToken(owner, 'UNDERLYING2', 6);
    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    const controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    gauge = await DeployerUtils.deployMultiGauge(
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


    await tetu.mint(owner2.address, parseUnits('100'));
    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner2).approve(ve.address, Misc.MAX_UINT);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

    // *** vaults

    vault = await DeployerUtils.deployMockToken(owner, 'VAULT', 18);
    vault2 = await DeployerUtils.deployMockToken(owner, 'VAULT2', 6);
    await controller.addVault(vault.address);
    await controller.addVault(vault2.address);

    await voter.vote(1, [vault.address], [100]);
    await voter.connect(owner2).vote(2, [vault.address], [100]);

    stakingToken = await DeployerUtils.deployMockStakingToken(owner, gauge.address, 'VAULT', 18);
    await gauge.addStakingToken(stakingToken.address);

    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await ve.whitelistPawnshop(pawnshop.address);

    const platformVoter = await DeployerUtils.deployPlatformVoter(owner, controller.address, ve.address);
    await controller.setPlatformVoter(platformVoter.address);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
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

  it("valid vaults length test", async function () {
    expect(await voter.validVaultsLength()).eq(2)
  });

  // *** VOTES

  it("reset test", async function () {
    expect(await voter.votes(1, vault.address)).above(parseUnits('0.98'))
    await voter.reset(1);
    expect(await voter.votes(1, vault.address)).eq(0)
  });

  it("reset not owner revert test", async function () {
    await expect(voter.reset(2)).revertedWith('!owner');
  });

  it("vote not owner revert test", async function () {
    await expect(voter.vote(2, [], [])).revertedWith('!owner');
  });

  it("vote wrong data revert test", async function () {
    await expect(voter.vote(1, [vault.address], [])).revertedWith('!arrays');
  });

  it("vote too many votes revert test", async function () {
    await expect(voter.vote(1,
        Array.from({length: 15}).map(() => vault.address),
        Array.from({length: 15}).map(() => 1)
      )
    ).revertedWith("Too many votes");
  });

  it("vote invalid vault revert test", async function () {
    await expect(voter.vote(1, [Misc.ZERO_ADDRESS], [100])).revertedWith("Invalid vault");
  });

  it("vote duplicate vault revert test", async function () {
    await expect(voter.vote(1, [vault.address, vault.address], [1, 1])).revertedWith("duplicate vault");
  });

  it("vote zero power revert test", async function () {
    await expect(voter.vote(1, [vault.address, vault2.address], [0, 1])).revertedWith("zero power");
  });

  it("vote delay revert test", async function () {
    await voter.vote(1, [vault.address], [-100]);
    await expect(voter.vote(1, [vault.address ], [1])).revertedWith("delay");
  });

  it("vote negative test", async function () {
    await voter.vote(1, [vault.address], [-100]);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    expect(await voter.votes(1, vault.address)).below(parseUnits('-0.94'))
    expect(await voter.usedWeights(1)).above(parseUnits('0.94'))
  });

  it("reset negative test", async function () {
    await voter.vote(1, [vault.address], [-100]);
    await voter.reset(1);
    expect(await voter.votes(1, vault.address)).eq(0)
    expect(await voter.usedWeights(1)).eq(0)
  });

  it("vote with empty votes test", async function () {
    await voter.vote(1, [], [])
    expect(await voter.votes(1, vault.address)).eq(0)
    expect(await voter.usedWeights(1)).eq(0)
  });

  // *** ATTACHMENTS

  it("attach/detach test", async function () {
    await stakingToken.mint(owner.address, parseUnits('1'));
    await gauge.attachVe(stakingToken.address, owner.address, 1);
    expect((await voter.attachedStakingTokens(1))[0]).eq(stakingToken.address);

    await gauge.detachVe(stakingToken.address, owner.address, 1);
    expect((await voter.attachedStakingTokens(1)).length).eq(0);
  });

  it("detach and reset votes on transfer test", async function () {
    await stakingToken.mint(owner.address, parseUnits('1'));
    await gauge.attachVe(stakingToken.address, owner.address, 1);

    const stakingToken2 = await DeployerUtils.deployMockStakingToken(owner, gauge.address, 'VAULT', 18);
    await gauge.addStakingToken(stakingToken2.address);
    await stakingToken2.mint(owner.address, parseUnits('1'));
    await gauge.attachVe(stakingToken2.address, owner.address, 1);
    // check attachments
    const attached = await voter.attachedStakingTokens(1);
    expect(attached.find((x: string) => x === stakingToken.address)).eq(stakingToken.address);
    expect(attached.find((x: string) => x === stakingToken2.address)).eq(stakingToken2.address);
    // check votes
    expect(await voter.votes(1, vault.address)).above(parseUnits('0.98'))
    // transfer should reset everything
    await ve.setApprovalForAll(pawnshop.address, true);
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1)
    // check that everything was reset
    expect((await voter.attachedStakingTokens(1)).length).eq(0);
    expect(await voter.votes(1, vault.address)).eq(0)
  });

  it("attach from not gauge revert", async function () {
    await expect(voter.attachTokenToGauge(stakingToken.address, 1, owner.address)).revertedWith('!gauge')
  });

  it("detach from not gauge revert", async function () {
    await expect(voter.detachTokenFromGauge(stakingToken.address, 1, owner.address)).revertedWith('!gauge')
  });

  it("detachAll from not ve revert", async function () {
    await expect(voter.detachTokenFromAll(1, owner.address)).revertedWith('!ve')
  });

  // *** NOTIFY

  it("notify test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));
    expect(await voter.index()).above(parseUnits('50'));
  });

  it("notify zero amount revert test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await expect(voter.notifyRewardAmount(0)).revertedWith("zero amount");
  });

  it("notify zero votes revert test", async function () {
    await voter.reset(1);
    await voter.connect(owner2).reset(2);
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await expect(voter.notifyRewardAmount(1)).revertedWith("!weights");
  });

  it("notify with little amount should not revert test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(1);
    expect(await voter.index()).eq(0);
  });

  // *** DISTRIBUTE

  it("distribute test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));

    await voter.distribute(vault.address);

    expect(await gauge.rewardRate(vault.address, tetu.address)).above(parseUnits('1.6', 32));
  });

  it("distribute all test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));

    await voter.distributeAll();

    expect(await gauge.rewardRate(vault.address, tetu.address)).above(parseUnits('1.6', 32));
    expect(await gauge.rewardRate(vault2.address, tetu.address)).eq(0);
  });

  it("distribute for range test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));

    await voter.distributeFor(0, 1);

    expect(await gauge.rewardRate(vault.address, tetu.address)).above(parseUnits('1.6', 32));
    expect(await gauge.rewardRate(vault2.address, tetu.address)).eq(0);
  });

  // *** UPDATE

  it("updateFor test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));

    await voter.updateFor([vault.address]);

    expect(await voter.claimable(vault.address)).above(parseUnits('99.9', 18));
    expect(await voter.supplyIndex(vault.address)).above(parseUnits('50', 18));

    expect(await voter.claimable(vault2.address)).eq(0);
    expect(await voter.supplyIndex(vault2.address)).eq(0);
  });

  it("updateAll test", async function () {
    await voter.vote(1, [vault.address, vault2.address], [1, 1]);

    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));

    expect(await voter.validVaultsLength()).eq(2);

    await voter.updateAll();

    expect(await voter.claimable(vault.address)).above(parseUnits('75', 18));
    expect(await voter.supplyIndex(vault.address)).above(parseUnits('50', 18));

    expect(await voter.claimable(vault2.address)).above(parseUnits('24.4', 18));
    expect(await voter.supplyIndex(vault2.address)).above(parseUnits('50', 18));
  });

  it("updateForRange test", async function () {
    await voter.vote(1, [vault.address, vault2.address], [1, 1]);

    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));

    expect(await voter.validVaultsLength()).eq(2);

    await voter.updateForRange(0, 2);

    expect(await voter.claimable(vault.address)).above(parseUnits('75', 18));
    expect(await voter.supplyIndex(vault.address)).above(parseUnits('50', 18));

    expect(await voter.claimable(vault2.address)).above(parseUnits('24.4', 18));
    expect(await voter.supplyIndex(vault2.address)).above(parseUnits('50', 18));
  });
});
