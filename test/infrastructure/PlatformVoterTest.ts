import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  ForwarderV3,
  MockPawnshop,
  MockStakingToken, MockStrategy,
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
    await controller.setVoter(platformVoter.address);

    forwarder = await DeployerUtils.deployForwarder(owner, controller.address, tetu.address);
    await controller.setForwarder(forwarder.address);

    await tetu.mint(owner2.address, parseUnits('100'));
    await tetu.mint(owner3.address, parseUnits('100'));

    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner2).approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner3).approve(ve.address, Misc.MAX_UINT);

    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(owner3).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
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
    await platformVoter.connect(owner2).vote(2, 1, 50, Misc.ZERO_ADDRESS);
    await platformVoter.connect(owner3).vote(3, 1, 30, Misc.ZERO_ADDRESS);
    expect(await forwarder.toInvestFundRatio()).eq(60);
  });

  it("vote without weight test", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    expect(await forwarder.toInvestFundRatio()).eq(0);
  });

  it("vote from not owner revert", async function () {
    await expect(platformVoter.connect(owner2).vote(1, 1, 100, Misc.ZERO_ADDRESS)).revertedWith('!owner');
  });

  it("vote with too high value revert", async function () {
    await expect(platformVoter.vote(1, 1, 1000000, Misc.ZERO_ADDRESS)).revertedWith('!value');
  });

  it("multiple vote test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    expect(await forwarder.toInvestFundRatio()).eq(100);
    expect(await forwarder.toGaugesRatio()).eq(100);
  });

  it("multiple vote reset test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.reset(1, [1,2], [Misc.ZERO_ADDRESS, Misc.ZERO_ADDRESS]);
    expect(await forwarder.toInvestFundRatio()).eq(0);
    expect(await forwarder.toGaugesRatio()).eq(0);
    expect((await platformVoter.veVotes(1)).length).eq(0);
  });

  it("reset vote test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    expect(await forwarder.toInvestFundRatio()).eq(100);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.reset(1, [1], [Misc.ZERO_ADDRESS]);
    expect(await forwarder.toInvestFundRatio()).eq(0);
  });

  it("transfer without votes test", async function () {
    await ve.setApprovalForAll(pawnshop.address, true);
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1)
  });

  it("detach and reset votes on transfer test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    // transfer should reset everything
    await ve.setApprovalForAll(pawnshop.address, true);
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1)
    expect(await forwarder.toInvestFundRatio()).eq(0);
    expect(await forwarder.toGaugesRatio()).eq(0);
    expect((await platformVoter.veVotes(1)).length).eq(0);
  });

  it("ve votes test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    const votes = await platformVoter.veVotes(1);
    expect(votes.length).eq(1);
    expect(votes[0]._type).eq(1);
    expect(votes[0].target).eq(Misc.ZERO_ADDRESS);
    expect(votes[0].weight).above(parseUnits('0.99'));
    expect(votes[0].weightedValue).above(parseUnits('99'));
    expect(votes[0].timestamp).above(0);
  });

  it("poke test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.poke(1);
  });

  it("re vote test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.vote(1, 1, 50, Misc.ZERO_ADDRESS);
    expect(await forwarder.toInvestFundRatio()).eq(50);
  });

  it("vote for gauge test", async function () {
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    expect(await forwarder.toGaugesRatio()).eq(100);
  });

  it("vote for strategy test", async function () {
    const strategy = await DeployerUtils.deployContract(owner, 'MockStrategy') as MockStrategy;
    await platformVoter.vote(1, 3, 100, strategy.address);
    expect(await strategy.compoundRatio()).eq(100);
  });

  it("vote for gauge wrong target revert", async function () {
    await expect(platformVoter.vote(1, 2, 100, owner.address)).revertedWith('!target');
  });

  it("vote for fund wrong target revert", async function () {
    await expect(platformVoter.vote(1, 1, 100, owner.address)).revertedWith('!target');
  });

  it("vote wrong type revert", async function () {
    await expect(platformVoter.vote(1, 0, 100, owner.address)).revertedWith('!type');
  });

  it("too many votes revert", async function () {
    for (let i = 0; i < 20; i++) {
      const strategy = await DeployerUtils.deployContract(owner, 'MockStrategy') as MockStrategy;
      await platformVoter.vote(1, 3, 100, strategy.address);
    }
    await expect(platformVoter.vote(1, 3, 100, Misc.ZERO_ADDRESS)).revertedWith('max');
  });
});
