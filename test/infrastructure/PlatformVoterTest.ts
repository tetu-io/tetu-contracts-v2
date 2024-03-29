import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  ControllerMinimal,
  ForwarderV3,
  MockBribe,
  MockBribe__factory,
  MockGauge,
  MockGauge__factory,
  MockPawnshop,
  MockStrategy,
  MockStrategy__factory,
  MockToken,
  PlatformVoter,
  StrategySplitterV2,
  VeTetu
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 7 * 16;

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
    await ve.announceAction(2);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await ve.whitelistTransferFor(pawnshop.address);

    platformVoter = await DeployerUtils.deployPlatformVoter(owner, controller.address, ve.address);
    await controller.setPlatformVoter(platformVoter.address);

    const voter = await DeployerUtils.deployContract(owner, 'MockVoter', ve.address)
    await controller.setVoter(voter.address);

    const mockGauge = MockGauge__factory.connect(await DeployerUtils.deployProxy(owner, 'MockGauge'), owner);
    await mockGauge.init(controller.address)
    const mockBribe = MockBribe__factory.connect(await DeployerUtils.deployProxy(owner, 'MockBribe'), owner);
    await mockBribe.init(controller.address);

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
    expect(await platformVoter.isVotesExist(1)).eq(true);
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

  it("reset multiple votes test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 3, 100, platformVoter.address);
    await platformVoter.vote(1, 3, 100, ve.address);

    expect(await platformVoter.veVotesLength(1)).eq(4);

    expect(await forwarder.toInvestFundRatio()).eq(100);
    expect(await forwarder.toGaugesRatio()).eq(100);

    const v0 = await platformVoter.votes(1, 0);
    const v1 = await platformVoter.votes(1, 1);
    const v2 = await platformVoter.votes(1, 2);
    const v3 = await platformVoter.votes(1, 3);
    expect(v0._type).eq(1);
    expect(v1._type).eq(2);
    expect(v2._type).eq(3);
    expect(v3._type).eq(3);
    expect(v2.target).eq(platformVoter.address);
    expect(v3.target).eq(ve.address);

    await TimeUtils.advanceBlocksOnTs(WEEK);

    await platformVoter.reset(1, [2, 3], [Misc.ZERO_ADDRESS, platformVoter.address]);

    expect(await platformVoter.veVotesLength(1)).eq(2);

    const v0New = await platformVoter.votes(1, 0);
    const v1New = await platformVoter.votes(1, 1);
    expect(v0New._type).eq(1);
    expect(v1New._type).eq(3);
    expect(v1New.target).eq(ve.address);
  });


  it("emergency reset vote test", async function () {
    await expect(platformVoter.connect(owner3).emergencyResetVote(1, 2, true)).revertedWith('!gov');

    expect(await forwarder.toInvestFundRatio()).eq(0);
    expect(await forwarder.toGaugesRatio()).eq(0);

    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 2, 100, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 3, 100, platformVoter.address);
    await platformVoter.vote(1, 3, 100, ve.address);

    expect(await platformVoter.veVotesLength(1)).eq(4);

    expect(await forwarder.toInvestFundRatio()).eq(100);
    expect(await forwarder.toGaugesRatio()).eq(100);

    const vv1 = [
      await platformVoter.votes(1, 0),
      await platformVoter.votes(1, 1),
      await platformVoter.votes(1, 2),
      await platformVoter.votes(1, 3)
    ];
    expect(vv1[0]._type).eq(1);
    expect(vv1[1]._type).eq(2);
    expect(vv1[2]._type).eq(3);
    expect(vv1[3]._type).eq(3);
    expect(vv1[2].target).eq(platformVoter.address);
    expect(vv1[3].target).eq(ve.address);

    await platformVoter.emergencyResetVote(1, 2, true);

    expect(await platformVoter.veVotesLength(1)).eq(3);

    const vv2 = [
      await platformVoter.votes(1, 0),
      await platformVoter.votes(1, 1),
      await platformVoter.votes(1, 2),
    ];
    expect(vv2[0]._type).eq(1);
    expect(vv2[1]._type).eq(2);
    expect(vv2[2]._type).eq(3);
    expect(vv2[2].target).eq(ve.address);

    await platformVoter.emergencyResetVote(1, 1, false);

    expect(await platformVoter.veVotesLength(1)).eq(2);

    const vv3 = [
      await platformVoter.votes(1, 0),
      await platformVoter.votes(1, 1),
    ];
    expect(vv3[0]._type).eq(1);
    expect(vv3[1]._type).eq(3);
    expect(vv3[1].target).eq(ve.address);

    expect(await forwarder.toInvestFundRatio()).eq(100);
    expect(await forwarder.toGaugesRatio()).eq(100);

  });

  it("emergency Adjust Weights test", async function () {
    await platformVoter.emergencyAdjustWeights(1, Misc.ZERO_ADDRESS, 100, 100);
    await expect(platformVoter.connect(owner3).emergencyAdjustWeights(1, Misc.ZERO_ADDRESS, 100, 1)).revertedWith('!gov');
    await expect(platformVoter.emergencyAdjustWeights(1, Misc.ZERO_ADDRESS, 1, 1000_000)).revertedWith('!ratio');
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
    expect(votes[0].weight).above(parseUnits('0.9'));
    expect(votes[0].weightedValue).above(parseUnits('9'));
    expect(votes[0].timestamp).above(0);
  });

  it("poke test", async function () {
    await platformVoter.vote(1, 1, 100, Misc.ZERO_ADDRESS);
    const beforeVotes = await platformVoter.veVotes(1)

    await TimeUtils.advanceBlocksOnTs(WEEK);

    await platformVoter.poke(1);
    const afterVotes = await platformVoter.veVotes(1)
    expect(beforeVotes[0].timestamp.toString()).eq(afterVotes[0].timestamp.toString());

    // vote for not strategy should not revert
    await platformVoter.vote(1, 3, 50000, platformVoter.address);
    expect(await platformVoter.veVotesLength(1)).eq(2);
    await TimeUtils.advanceBlocksOnTs(WEEK * 8);
    await platformVoter.poke(1);
    expect(await platformVoter.veVotesLength(1)).eq(2);

    // poke for ended ve should not revert
    await TimeUtils.advanceBlocksOnTs(WEEK * 52);
    await platformVoter.poke(1);
    expect(await platformVoter.veVotesLength(1)).eq(0);
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
    const strategy = MockStrategy__factory.connect(await DeployerUtils.deployProxy(owner, 'MockStrategy'), owner);
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
      const strategy = MockStrategy__factory.connect(await DeployerUtils.deployProxy(owner, 'MockStrategy'), owner);
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
    const strategy = MockStrategy__factory.connect(await DeployerUtils.deployProxy(owner, 'MockStrategy'), owner);
    await strategy.init(controller.address, splitter.address)
    await platformVoter.voteBatch(1, [2, 3], [100, 100], [Misc.ZERO_ADDRESS, strategy.address]);
    expect(await forwarder.toGaugesRatio()).eq(100);
    expect(await strategy.compoundRatio()).eq(100);
  });

  it("vote batch not owner revert", async function () {
    await expect(platformVoter.voteBatch(2, [2], [100], [Misc.ZERO_ADDRESS])).revertedWith('!owner');
  });


  it("should remove votes properly", async function () {
    await platformVoter.vote(1, 1, 23_000, Misc.ZERO_ADDRESS);
    await platformVoter.vote(1, 2, 48_000, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(WEEK);
    await platformVoter.vote(1, 1, 70_000, Misc.ZERO_ADDRESS);

    const votes = await platformVoter.veVotes(1);

    const types = new Set<number>();
    for (const vote of votes) {
      expect(types.has(vote._type)).eq(false);
      console.log(vote._type);
      types.add(vote._type)
    }
  });


});
