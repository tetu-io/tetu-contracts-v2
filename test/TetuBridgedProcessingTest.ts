import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {TimeUtils} from "./TimeUtils";
import {DeployerUtils} from "../scripts/utils/DeployerUtils";
import {MockToken, TetuBridgedProcessing} from "../typechain";


const {expect} = chai;

describe("TetuBridgedProcessingTest", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;

  let tetuBridged: MockToken;
  let tetu: MockToken;
  let processor: TetuBridgedProcessing;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    tetuBridged = await DeployerUtils.deployMockToken(owner, 'TETU bridged', 18, false);
    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18, false);

    processor = await DeployerUtils.deployContract(owner, 'TetuBridgedProcessing', tetu.address, tetuBridged.address, owner.address) as TetuBridgedProcessing;
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

  it("bridgeTetuToMainnet test", async function () {
    expect((await tetuBridged.balanceOf(owner.address)).isZero()).eq(true);
    expect((await tetu.balanceOf(owner.address)).isZero()).eq(true);
    await tetu.mint(owner.address, 1)
    await tetu.approve(processor.address, 1)
    await expect(processor.bridgeTetuToMainnet(1)).revertedWith('ERC20: transfer amount exceeds balance');
    await tetuBridged.mint(processor.address, 1)
    await processor.bridgeTetuToMainnet(1);
    expect((await tetuBridged.balanceOf(owner.address)).toNumber()).eq(1);
    expect((await tetu.balanceOf(owner.address)).isZero()).eq(true);
  });

  it("claimBridgedTetu test", async function () {
    expect((await tetuBridged.balanceOf(owner.address)).isZero()).eq(true);
    expect((await tetu.balanceOf(owner.address)).isZero()).eq(true);
    await tetuBridged.mint(owner.address, 1)
    await tetuBridged.approve(processor.address, 1)
    await expect(processor.claimBridgedTetu(1)).revertedWith('ERC20: transfer amount exceeds balance');
    await tetu.mint(processor.address, 1)
    await processor.claimBridgedTetu(1);
    expect((await tetu.balanceOf(owner.address)).toNumber()).eq(1);
    expect((await tetuBridged.balanceOf(owner.address)).isZero()).eq(true);
  });

  it("claimBridgedTetu pause test", async function () {

    await tetuBridged.mint(owner.address, 1)
    await tetuBridged.approve(processor.address, 1)
    await tetu.mint(processor.address, 1)

    await processor.pauseOn();
    await expect(processor.claimBridgedTetu(1)).revertedWith('paused');

    await processor.pauseOff();

    await processor.claimBridgedTetu(1);
    expect((await tetu.balanceOf(owner.address)).toNumber()).eq(1);
    expect((await tetuBridged.balanceOf(owner.address)).isZero()).eq(true);
  });

  it("bridgeTetuToMainnet pause test", async function () {
    expect((await tetuBridged.balanceOf(owner.address)).isZero()).eq(true);
    expect((await tetu.balanceOf(owner.address)).isZero()).eq(true);
    await tetu.mint(owner.address, 1)
    await tetu.approve(processor.address, 1)
    await tetuBridged.mint(processor.address, 1)

    await processor.pauseOn();
    await expect(processor.bridgeTetuToMainnet(1)).revertedWith('paused');

    await processor.pauseOff();
    await processor.bridgeTetuToMainnet(1);


    expect((await tetuBridged.balanceOf(owner.address)).toNumber()).eq(1);
    expect((await tetu.balanceOf(owner.address)).isZero()).eq(true);
  });

  it("offer admin test", async function () {
    expect(await processor.admin()).eq(owner.address);
    await processor.offerAdmin(owner2.address);
    expect(await processor.pendingAdmin()).eq(owner2.address);
    await processor.connect(owner2).acceptAdmin()
    expect(await processor.admin()).eq(owner2.address);
  });
});
