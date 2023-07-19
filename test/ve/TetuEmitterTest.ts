import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {MockBribe, MockBribe__factory, MockToken, MockVeDist, MockVoter, TetuEmitter} from "../../typechain";


const {expect} = chai;

describe("TetuEmitterTest", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;

  let emitter: TetuEmitter;
  let veDist: MockVeDist;
  let voter: MockVoter;
  let tetu: MockToken;
  let bribe: MockBribe;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    const controller = await DeployerUtils.deployMockController(owner);

    tetu = await DeployerUtils.deployMockToken(owner, 'TETU');
    veDist = await DeployerUtils.deployContract(owner, 'MockVeDist') as MockVeDist;
    const ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);
    voter = await DeployerUtils.deployMockVoter(owner, ve.address);
    bribe = MockBribe__factory.connect(await DeployerUtils.deployProxy(owner, 'MockBribe'), owner);
    await bribe.init(controller.address);

    await controller.setVeDistributor(veDist.address);
    await controller.setVoter(voter.address);


    emitter = await DeployerUtils.deployTetuEmitter(owner, controller.address, tetu.address, bribe.address);
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

  it("startEpoch to voter 100% test", async function () {
    await expect(emitter.startEpoch(100)).revertedWith("!amount");
    await tetu.transfer(emitter.address, 100)
    await emitter.startEpoch(100);
    await expect(emitter.startEpoch(100)).revertedWith("too early");

    expect(await tetu.balanceOf(voter.address)).eq(100);
    expect(await bribe.epoch()).eq(1);
    expect(await emitter.epoch()).eq(1);
    expect(await emitter.startEpochTS()).above(0);
  });

  it("gelato Resolver test", async function () {
    await tetu.transfer(emitter.address, 100)


    expect(await emitter.isReadyToStart()).eq(true);
    expect((await emitter.gelatoResolver()).canExec).eq(true);

    await emitter.startEpoch(100);

    expect(await emitter.isReadyToStart()).eq(false);
    expect((await emitter.gelatoResolver()).canExec).eq(false);
  });

  it("startEpoch to ve 100% test", async function () {
    await expect(emitter.connect(owner2).setToVeRatio(100)).revertedWith("!gov");
    await expect(emitter.setToVeRatio(100_001)).revertedWith("too high");
    await emitter.setToVeRatio(100_000);
    await tetu.transfer(emitter.address, 100)
    await emitter.startEpoch(100);

    expect(await tetu.balanceOf(veDist.address)).eq(100);
  });

  it("startEpoch twice test", async function () {
    await tetu.transfer(emitter.address, 200)
    await emitter.startEpoch(100);
    expect(await tetu.balanceOf(voter.address)).eq(100);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7);

    await emitter.startEpoch(100);
    expect(await tetu.balanceOf(voter.address)).eq(200);
  });

  it("startEpoch with zero amount test", async function () {
    await emitter.startEpoch(0);
    expect(await bribe.epoch()).eq(1);
    expect(await emitter.epoch()).eq(1);
    expect(await emitter.startEpochTS()).above(0);
  });

  it("setMinAmountPerEpoch test", async function () {
    await expect(emitter.connect(owner2).setMinAmountPerEpoch(100)).revertedWith("!gov");
    await emitter.setMinAmountPerEpoch(200);
    await tetu.transfer(emitter.address, 100)
    await expect(emitter.startEpoch(100)).revertedWith("!amount");
    await tetu.transfer(emitter.address, 100)
    await emitter.startEpoch(200);

    expect(await tetu.balanceOf(voter.address)).eq(200);
  });

  it("changeOperator test", async function () {
    await expect(emitter.connect(owner2).startEpoch(100)).revertedWith("!operator");
    await expect(emitter.connect(owner2).changeOperator(owner2.address)).revertedWith("!gov");
    await emitter.changeOperator(owner2.address);
    await tetu.transfer(emitter.address, 100)
    await emitter.connect(owner2).startEpoch(100);
    expect(await tetu.balanceOf(voter.address)).eq(100);
  });
});
