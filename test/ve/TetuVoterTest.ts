import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {
  IERC20__factory,
  IERC20Metadata, IERC20Metadata__factory,
  MockPawnshop,
  MockToken,
  MockVoter, MultiGauge, ProxyControlled, TetuVoter,
  VeTetu, VeTetu__factory
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";

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
      ve.address
    );

    voter = await DeployerUtils.deployTetuVoter(
      owner,
      controller.address,
      ve.address,
      tetu.address,
      gauge.address,
      Misc.ZERO_ADDRESS // todo
    );
    const pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await controller.setVoter(voter.address);
    await controller.setVePawnshop(pawnshop.address);

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

  it("test", async function () {
  });


});
