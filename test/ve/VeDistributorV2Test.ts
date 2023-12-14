import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {ControllerMinimal, MockToken, VeDistributorV2, VeDistributorV2__factory, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {checkTotalVeSupplyAtTS, currentEpochTS, LOCK_PERIOD, WEEK} from "../test-utils";
import {CheckpointEventObject} from "../../typechain/ve/VeDistributorV2";

const {expect} = chai;

const checkpointEvent = VeDistributorV2__factory.createInterface().getEvent('Checkpoint');

describe("VeDistributorV2Test", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tetu: MockToken;
  let controller: ControllerMinimal;

  let ve: VeTetu;
  let veDist: VeDistributorV2;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    veDist = await DeployerUtils.deployVeDistributorV2(
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
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
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

  it("emergency withdraw", async function () {
    await veDist.emergencyWithdraw();
    expect((await tetu.balanceOf(veDist.address)).isZero()).eq(true);
  });

  it("checkpointTotalSupply", async function () {
    await veDist.checkpointTotalSupply();
  });

  it("distribute and claim", async function () {
    expect(await startNewEpoch(ve, veDist)).eq(false);
    // need to wait for make sure everyone has powers at epoch start
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    // check pre conditions
    expect((await veDist.claimable(1)).isZero()).eq(true);
    expect((await veDist.claimable(2)).isZero()).eq(true);
    await checkTotalVeSupplyAtTS(ve, await currentEpochTS(ve));
    console.log('precheck is fine')

    // empty claim
    await veDist.claimMany([1]);

    // --- NEW EPOCH

    await tetu.transfer(veDist.address, parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch()).toNumber()).eq(1);

    expect(+formatUnits(await veDist.claimable(1))).eq(50);
    expect(+formatUnits(await veDist.claimable(2))).eq(50);

    await veDist.claimMany([1]);
    await expect(veDist.claimMany([2])).revertedWith('not owner');
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await tetu.balanceOf(veDist.address))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    expect(await startNewEpoch(ve, veDist)).eq(false);

    await tetu.transfer(veDist.address, parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(false);

    await TimeUtils.advanceBlocksOnTs(WEEK);
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch()).toNumber()).eq(2);

    expect(+formatUnits(await veDist.claimable(1))).eq(50);
    expect(+formatUnits(await veDist.claimable(2))).eq(50);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await tetu.balanceOf(veDist.address))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    await ve.setAlwaysMaxLock(1, true);

    await TimeUtils.advanceBlocksOnTs(WEEK);
    await tetu.transfer(veDist.address, parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch()).toNumber()).eq(3);

    expect(+formatUnits(await veDist.claimable(1))).approximately(65, 5);
    expect(+formatUnits(await veDist.claimable(2))).approximately(35, 5);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await tetu.balanceOf(veDist.address))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    await ve.setAlwaysMaxLock(1, false);

    await TimeUtils.advanceBlocksOnTs(WEEK * 4);
    await tetu.transfer(veDist.address, parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch()).toNumber()).eq(4);

    expect(+formatUnits(await veDist.claimable(1))).approximately(70, 5);
    expect(+formatUnits(await veDist.claimable(2))).approximately(30, 5);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await tetu.balanceOf(veDist.address))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    await ve.connect(owner2).increaseAmount(tetu.address, 2, parseUnits('10'));

    await TimeUtils.advanceBlocksOnTs(WEEK);
    await tetu.transfer(veDist.address, parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch()).toNumber()).eq(5);

    expect(+formatUnits(await veDist.claimable(1))).approximately(20, 5);
    expect(+formatUnits(await veDist.claimable(2))).approximately(80, 5);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await tetu.balanceOf(veDist.address))).approximately(0, 0.000000000000001);

  });

});


async function startNewEpoch(ve: VeTetu, veDist: VeDistributorV2): Promise<boolean> {
  const oldEpoch = await veDist.epoch()

  const prevEpochTs = (await veDist.epochInfos(oldEpoch)).ts.toNumber();
  console.log('prevEpochTs', prevEpochTs);
  const curTs = await currentEpochTS(ve);
  console.log('curTs', curTs);


  const checkpointTx = await (await veDist.checkpoint()).wait();
  let checkpoint: CheckpointEventObject | undefined;
  for (const event of checkpointTx.events ?? []) {
    if (event.topics[0] !== VeDistributorV2__factory.createInterface().getEventTopic(checkpointEvent)) {
      continue;
    }
    checkpoint = VeDistributorV2__factory.createInterface().decodeEventLog(checkpointEvent, event.data, event.topics) as unknown as CheckpointEventObject;
  }
  if (!checkpoint) {
    return false;
  }

  console.log('checkpoint epoch', checkpoint.epoch.toNumber());
  console.log('checkpoint newEpochTs', checkpoint.newEpochTs.toNumber());
  console.log('checkpoint tokenBalance', formatUnits(checkpoint.tokenBalance));
  console.log('checkpoint prevTokenBalance', formatUnits(checkpoint.prevTokenBalance));
  console.log('checkpoint tokenDiff', formatUnits(checkpoint.tokenDiff));
  console.log('checkpoint rewardsPerToken', formatUnits(checkpoint.rewardsPerToken));
  console.log('checkpoint veTotalSupply', formatUnits(checkpoint.veTotalSupply));

  expect(curTs).eq(checkpoint.newEpochTs.toNumber());

  await checkTotalVeSupplyAtTS(ve, curTs);

  return oldEpoch.add(1).eq(checkpoint.epoch);
}
