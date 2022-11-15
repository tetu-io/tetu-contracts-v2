import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  ControllerMinimal,
  ForwarderV3, MockGauge,
  MockPawnshop,
  MockStakingToken, MockStrategy,
  MockToken,
  MultiBribe,
  MultiGauge, PlatformVoter, StrategySplitterV2,
  TetuVoter,
  VeTetu
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import { MockBribe } from "../../typechain/MockBribe";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 90;

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
  let controller: ControllerMinimal;
  let splitter: StrategySplitterV2;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);

    controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);

    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await ve.whitelistPawnshop(pawnshop.address);

    platformVoter = await DeployerUtils.deployPlatformVoter(owner, controller.address, ve.address);
    await controller.setPlatformVoter(platformVoter.address);
    await controller.setVoter(platformVoter.address);

    const mockGauge = await DeployerUtils.deployContract(owner, 'MockGauge', controller.address) as MockGauge;
    const mockBribe = await DeployerUtils.deployContract(owner, 'MockBribe', controller.address) as MockBribe;

    forwarder = await DeployerUtils.deployForwarder(owner, controller.address, tetu.address, mockBribe.address);
    await controller.setForwarder(forwarder.address);

    const vault = await DeployerUtils.deployTetuVaultV2(
      owner,
      controller.address,
      tetu.address,
      'TETU',
      'TETU',
      mockGauge.address,
      0
    );
    splitter = await DeployerUtils.deploySplitter(owner, controller.address, tetu.address, vault.address);

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

  it("vote delay revert", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await expect(platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS)).revertedWith('delay');
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
    await platformVoter.reset(1, [1, 2], [Misc.ZERO_ADDRESS, Misc.ZERO_ADDRESS]);
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

  it("reset vote with zero value test", async function () {
    await platformVoter.vote(1, 1, 0, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.reset(1, [1], [Misc.ZERO_ADDRESS]);
  });

  it("reset vote with zero value multi test", async function () {
    await platformVoter.connect(owner2).vote(2, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 1, 0, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.reset(1, [1], [Misc.ZERO_ADDRESS]);
  });

  it("reset vote delay revert", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await expect(platformVoter.reset(1, [1], [Misc.ZERO_ADDRESS])).revertedWith('delay');
  });

  it("reset vote not owner revert", async function () {
    await expect(platformVoter.reset(2, [1], [Misc.ZERO_ADDRESS])).revertedWith('!owner');
  });

  it("detache not ve revert", async function () {
    await expect(platformVoter.detachTokenFromAll(1, Misc.ZERO_ADDRESS)).revertedWith('!ve');
  });

  it("reset empty votes test", async function () {
    await platformVoter.reset(1, [1], [Misc.ZERO_ADDRESS])
  });

  it("reset not exist vote test", async function () {
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    await platformVoter.reset(1, [1], [Misc.ZERO_ADDRESS])
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
    expect(votes[0].weight).above(parseUnits('0.94'));
    expect(votes[0].weightedValue).above(parseUnits('94'));
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

  it("re vote multiple test", async function () {
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
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
    await strategy.init(controller.address, splitter.address)
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
      await strategy.init(controller.address, splitter.address)
      await platformVoter.vote(1, 3, 100, strategy.address);
    }
    await expect(platformVoter.vote(1, 3, 100, Misc.ZERO_ADDRESS)).revertedWith('max');
  });

  it("votes length test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS)
    expect(await platformVoter.veVotesLength(1)).eq(1);
  });


  it("vote batch test", async function () {
    const strategy = await DeployerUtils.deployContract(owner, 'MockStrategy') as MockStrategy;
    await strategy.init(controller.address, splitter.address)
    await platformVoter.voteBatch(1, [2, 3], [100, 100], [Misc.ZERO_ADDRESS, strategy.address]);
    expect(await forwarder.toGaugesRatio()).eq(100);
    expect(await strategy.compoundRatio()).eq(100);
  });

  it("vote batch not owner revert", async function () {
    await expect(platformVoter.voteBatch(2, [2], [100], [Misc.ZERO_ADDRESS])).revertedWith('!owner');
  });

});
