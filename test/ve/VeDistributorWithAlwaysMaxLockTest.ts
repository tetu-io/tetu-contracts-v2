import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {ControllerMinimal, MockPawnshop, MockToken, MockVoter, VeDistributor, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 90;

describe.skip("VeDistributorWithAlwaysMaxLockTest", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tetu: MockToken;
  let controller: ControllerMinimal;

  let ve: VeTetu;
  let voter: MockVoter;
  let pawnshop: MockPawnshop;
  let veDist: VeDistributor;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);
    voter = await DeployerUtils.deployMockVoter(owner, ve.address);
    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await controller.setVoter(voter.address);
    await ve.announceAction(2);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await ve.whitelistTransferFor(pawnshop.address);

    veDist = await DeployerUtils.deployVeDistributor(
      owner,
      controller.address,
      ve.address,
      tetu.address,
    );
    await controller.setVeDistributor(veDist.address);

    await tetu.mint(owner2.address, parseUnits('100'));
    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner2).approve(ve.address, Misc.MAX_UINT);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.setAlwaysMaxLock(1, true);
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    // await ve.connect(owner2).setAlwaysMaxLock(2, true);

    await ve.setApprovalForAll(pawnshop.address, true);
    await ve.connect(owner2).setApprovalForAll(pawnshop.address, true);
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

  it("multi checkpointToken with empty balance test", async function () {
    await tetu.transfer(veDist.address, parseUnits('10'));
    await veDist.checkpoint();
    await veDist.checkpoint();
  });

  it("adjustToDistribute test", async function () {
    expect(await veDist.adjustToDistribute(100, 1, 1, 20)).eq(100);
    expect(await veDist.adjustToDistribute(100, 0, 1, 20)).eq(100);
    expect(await veDist.adjustToDistribute(100, 2, 1, 20)).eq(5);
  });

  it("checkpointTotalSupply dummy test", async function () {
    await ve.checkpoint();
    await veDist.checkpointTotalSupply();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.checkpoint();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.checkpoint();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.checkpoint();
    await veDist.checkpointTotalSupply();
  });

  it("adjustVeSupply test", async function () {
    expect(await veDist.adjustVeSupply(100, 100, 5, 10)).eq(5);
    expect(await veDist.adjustVeSupply(99, 100, 5, 10)).eq(0);
    expect(await veDist.adjustVeSupply(200, 100, 5, 10)).eq(0);
    expect(await veDist.adjustVeSupply(2, 1, 20, 5)).eq(15);
    expect(await veDist.adjustVeSupply(3, 1, 20, 5)).eq(10);
  });

  it("claim for non exist token test", async function () {
    await veDist.claim(99);
  });

  it("claim without rewards test", async function () {
    await veDist.claim(1);
  });

  it("claim for early token test", async function () {
    const ve1 = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    await tetu.approve(ve1.address, parseUnits('10000'))
    await ve1.createLock(tetu.address, parseUnits('1'), 60 * 60 * 24 * 14);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    const veDist1 = await DeployerUtils.deployVeDistributor(
      owner,
      controller.address,
      ve1.address,
      tetu.address
    );

    await tetu.transfer(veDist.address, parseUnits('1'));
    await veDist.checkpoint();

    await veDist1.claim(1);
  });

  it("claimMany for early token test", async function () {
    const ve1 = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    await tetu.approve(ve1.address, parseUnits('10000'))
    await ve1.createLock(tetu.address, parseUnits('1'), 60 * 60 * 24 * 14);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    const veDist1 = await DeployerUtils.deployVeDistributor(
      owner,
      controller.address,
      ve1.address,
      tetu.address
    );

    await tetu.transfer(veDist.address, parseUnits('1'))
    await veDist.checkpoint();

    await veDist1.claimMany([1]);
  });

  it("claim for early token with delay test", async function () {
    const ve1 = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    await tetu.approve(ve1.address, parseUnits('10000'))
    await ve1.createLock(tetu.address, parseUnits('1'), 60 * 60 * 24 * 14);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    const veDist1 = await DeployerUtils.deployVeDistributor(
      owner,
      controller.address,
      ve1.address,
      tetu.address,
    );

    await tetu.transfer(veDist.address, parseUnits('1'))
    await veDist.checkpoint();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await veDist1.claim(1);
    await veDist1.claimMany([1]);
  });

  it("claimMany for early token with delay test", async function () {
    const ve1 = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    await tetu.approve(ve1.address, parseUnits('10000'))
    await ve1.createLock(tetu.address, parseUnits('1'), 60 * 60 * 24 * 14);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    const veDist1 = await DeployerUtils.deployVeDistributor(
      owner,
      controller.address,
      ve1.address,
      tetu.address,
    );

    await tetu.transfer(veDist.address, parseUnits('1'))
    await veDist.checkpoint();
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await veDist1.claimMany([1]);
  });

  it("claim with rewards test", async function () {
    await ve.createLock(tetu.address, WEEK * 2, LOCK_PERIOD);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);

    await tetu.transfer(veDist.address, parseUnits('1'));
    await veDist.checkpoint();
    await veDist.checkpointTotalSupply();
    await veDist.claim(2);
  });

  it("claim without checkpoints after the launch should return zero", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    const maxUserEpoch = await ve.userPointEpoch(2)
    const startTime = await veDist.startTime();
    let weekCursor = await veDist.timeCursorOf(2);
    let userEpoch;
    if (weekCursor.isZero()) {
      userEpoch = await veDist.findTimestampUserEpoch(ve.address, 2, startTime, maxUserEpoch);
    } else {
      userEpoch = await veDist.userEpochOf(2);
    }
    if (userEpoch.isZero()) {
      userEpoch = BigNumber.from(1);
    }
    const userPoint = await ve.userPointHistory(2, userEpoch);
    if (weekCursor.isZero()) {
      weekCursor = userPoint.ts.add(WEEK).sub(1).div(WEEK).mul(WEEK);
    }
    const lastTokenTime = await veDist.lastTokenTime();
    expect(weekCursor.gte(lastTokenTime)).eq(true);
  });

  it("claim with rewards with minimal possible amount and lock", async function () {
    await ve.createLock(tetu.address, LOCK_PERIOD, WEEK);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await tetu.transfer(veDist.address, parseUnits('1'))
    await veDist.checkpoint();
    await veDist.checkpointTotalSupply();

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);

    let bal = await ve.balanceOfNFT(2)
    expect(bal).above(0)
    await veDist.claim(2);
    expect((await tetu.balanceOf(await tetu.signer.getAddress())).sub(bal)).above(parseUnits('0.08'));

    // SECOND CLAIM

    await tetu.transfer(veDist.address, parseUnits('10000'))
    await veDist.checkpoint();

    await TimeUtils.advanceBlocksOnTs(123456);

    bal = await ve.balanceOfNFT(2)
    await veDist.claim(2);
    expect((await tetu.balanceOf(await tetu.signer.getAddress())).sub(bal)).above(parseUnits('0.38'));
  });

  it("claimMany on old block test", async function () {
    await ve.createLock(tetu.address, LOCK_PERIOD, WEEK);
    await veDist.claimMany([1, 2, 0]);
  });

  it("timestamp test", async function () {
    expect(await veDist.timestamp()).above(0);
  });

  it("claimable test", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), WEEK);
    expect(await veDist.claimable(1)).eq(0);
  });

  it("claimMany test", async function () {
    expect(+formatUnits(await tetu.balanceOf(veDist.address))).eq(0);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await tetu.transfer(veDist.address, parseUnits('10000'))
    await veDist.checkpoint();
    await veDist.claimMany([1, 2]);

    console.log('ve dist bal', +formatUnits(await tetu.balanceOf(veDist.address)))
    expect(+formatUnits(await tetu.balanceOf(veDist.address))).lt(1500);
  });

  it("calculateToDistribute with zero values test", async function () {
    await veDist.calculateToDistribute(
      0,
      0,
      999,
      {
        bias: 0,
        slope: 0,
        ts: 0,
        blk: 0,
      },
      1,
      0,
      ve.address
    );
  });


});


export async function checkTotalVeSupply(ve: VeTetu) {
  const total = +formatUnits(await ve.totalSupply());
  console.log('total', total)
  const nftCount = (await ve.tokenId()).toNumber();

  let sum = 0;
  for (let i = 1; i <= nftCount; ++i) {
    const bal = +formatUnits(await ve.balanceOfNFT(i))
    console.log('bal', i, bal)
    sum += bal;
  }
  console.log('sum', sum)
  expect(sum).approximately(total, 0.0000000000001);
  console.log('total supply is fine')
}
