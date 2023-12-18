import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {
  InterfaceIds,
  MockPawnshop,
  MockStakingToken,
  MockToken, MockVault,
  MultiGaugeNoBoost,
  TetuVoterSimplified
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 16 * WEEK;

describe("Tetu voter simplified tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tetu: MockToken;
  let underlying2: MockToken;

  let voter: TetuVoterSimplified;
  let gauge: MultiGaugeNoBoost;

  let vault: MockVault;
  let vault2: MockVault;
  let stakingToken: MockStakingToken;
  let pawnshop: MockPawnshop;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    underlying2 = await DeployerUtils.deployMockToken(owner, 'UNDERLYING2', 6);
    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    const controller = await DeployerUtils.deployMockController(owner);

    gauge = await DeployerUtils.deployMultiGaugeNoBoost(
      owner,
      controller.address,
      tetu.address
    );

    voter = await DeployerUtils.deployTetuVoterSimplified(
      owner,
      controller.address,
      tetu.address,
      gauge.address,
    );

    await controller.setVoter(voter.address);


    await tetu.mint(owner2.address, parseUnits('100'));

    // *** vaults
    const strategy = ethers.Wallet.createRandom().address;
    const strategy2 = ethers.Wallet.createRandom().address;

    const asset = await DeployerUtils.deployMockToken(owner, 'VAULT', 18);
    const asset2 = await DeployerUtils.deployMockToken(owner, 'VAULT2', 6);

    vault = await DeployerUtils.deployMockVault(owner, controller.address, asset.address, "VAULT",  strategy, 0);
    vault2 = await DeployerUtils.deployMockVault(owner, controller.address, asset2.address, "VAULT2", strategy2, 0);
    await controller.addVault(vault.address);
    await controller.addVault(vault2.address);

    stakingToken = await DeployerUtils.deployMockStakingToken(owner, gauge.address, 'VAULT', 18);
    await gauge.addStakingToken(stakingToken.address);

    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
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

  it("is vault test", async function () {
    expect(await voter.isVault(vault.address)).eq(true)
    expect(await voter.isVault(owner.address)).eq(false)
  });

  it("valid vaults test", async function () {
    expect(await voter.validVaults(0)).eq(vault.address)
  });

  it("voted vault length test", async function () {
    expect(await voter.votedVaultsLength(0)).eq(0)
  });

  it("valid vaults length test", async function () {
    expect(await voter.validVaultsLength()).eq(2)
  });

  // *** NOTIFY

  it("notify test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(parseUnits('100'));
    expect(await voter.index()).above(parseUnits('50'));
  });

  it("notify zero amount revert test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await expect(voter.notifyRewardAmount(0)).revertedWith("zero amount");
  });

  it("notify zero votes revert test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await expect(voter.notifyRewardAmount(1)).revertedWith("!weights");
  });

  it("notify with little amount should not revert test", async function () {
    await tetu.approve(voter.address, Misc.MAX_UINT);
    await voter.notifyRewardAmount(1);
    expect(await voter.index()).eq(0);
  });


  // *** UPDATE


  it("supports interface", async function () {
    expect(await voter.supportsInterface('0x00000000')).eq(false);
    const interfaceIds = await DeployerUtils.deployContract(owner, 'InterfaceIds') as InterfaceIds;
    expect(await voter.supportsInterface(await interfaceIds.I_VOTER())).eq(true);
  });
});
