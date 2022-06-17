import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  ForwarderV3,
  MockPawnshop,
  MockStakingToken,
  MockToken,
  MultiBribe,
  MultiGauge, PlatformVoter,
  TetuVoter,
  VeTetu
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 365;

describe("Platform voter tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;

  let tetu: MockToken;
  let ve: VeTetu;
  let platformVoter: PlatformVoter;
  let pawnshop: MockPawnshop;
  let forwarder: ForwarderV3;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);

    const controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await ve.whitelistPawnshop(pawnshop.address);

    platformVoter = await DeployerUtils.deployPlatformVoter(owner, controller.address, ve.address);
    await controller.setPlatformVoter(platformVoter.address);

    forwarder = await DeployerUtils.deployForwarder(owner, controller.address, tetu.address);
    await controller.setForwarder(forwarder.address);

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

  it("vote test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.connect(owner2).vote(2, 1, 0, Misc.ZERO_ADDRESS);
    expect(await forwarder.toInvestFundRatio()).eq(100);
  });

});
