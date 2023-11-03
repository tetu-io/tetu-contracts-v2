import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {ControllerMinimal, MockPawnshop, MockToken, MockVoter, VeDistributorV2, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 90;

describe("VeDistributorV2Test", function () {

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
  let veDist: VeDistributorV2;


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

    veDist = await DeployerUtils.deployVeDistributorV2(
      owner,
      controller.address,
      ve.address,
      tetu.address,
    );

    await tetu.mint(owner2.address, parseUnits('100'));
    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner2).approve(ve.address, Misc.MAX_UINT);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

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

  it("emergency withdraw", async function () {
    await veDist.emergencyWithdraw();
    expect((await tetu.balanceOf(veDist.address)).isZero()).eq(true);
  });

  it("distribute and claim", async function () {
    // need to wait for make sure everyone has powers at epoch start
    // await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    // check pre conditions
    expect((await veDist.claimable(1)).isZero()).eq(true);
    expect((await veDist.claimable(2)).isZero()).eq(true);
    await checkTotalVeSupplyAtTS(ve, currentEpochTS());
    console.log('precheck is fine')

    await tetu.transfer(veDist.address, parseUnits('100'));
    await veDist.checkpoint();

    expect(+formatUnits(await veDist.claimable(1))).eq(50);
    expect(+formatUnits(await veDist.claimable(2))).eq(50);

    await veDist.claimMany([1, 2]);

    expect((await tetu.balanceOf(veDist.address)).isZero()).eq(true);

  });

});

function currentEpochTS() {
  return Math.floor(Date.now() / 1000 / WEEK) * WEEK;
}

export async function checkTotalVeSupplyAtTS(ve: VeTetu, ts: number) {
  const total = +formatUnits(await ve.totalSupplyAtT(ts));
  console.log('total', total)
  const nftCount = (await ve.tokenId()).toNumber();

  let sum = 0;
  for (let i = 1; i <= nftCount; ++i) {
    const bal = +formatUnits(await ve.balanceOfNFTAt(i, ts))
    console.log('bal', i, bal)
    sum += bal;
  }
  console.log('sum', sum)
  expect(sum).approximately(total, 0.0000000000001);
  console.log('total supply is fine')
}
