import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {ControllerMinimal, MockPawnshop, MockToken, MockVoter, VeDistributorV2, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";

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

});
