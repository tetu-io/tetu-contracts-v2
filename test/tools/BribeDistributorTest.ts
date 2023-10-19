import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BribeDistribution, MockToken,} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("BribeDistributorTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;

  let distr: BribeDistribution;
  let token: MockToken;


  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();
    [signer, signer2] = await ethers.getSigners();

    token = await DeployerUtils.deployMockToken(signer, 'TETU', 18);
    const controller = await DeployerUtils.deployMockController(signer);
    const ve = await DeployerUtils.deployVeTetu(signer, token.address, controller.address);

    const veDist = await DeployerUtils.deployVeDistributor(
      signer,
      controller.address,
      ve.address,
      token.address,
    );

    distr = await DeployerUtils.deployContract(signer, "BribeDistribution", veDist.address, token.address) as BribeDistribution;
  })

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("set new owner test", async () => {
    await expect(distr.connect(signer2).offerOwnership(signer2.address)).revertedWith('NOT_OWNER');
    await distr.offerOwnership(signer2.address)
    await expect(distr.acceptOwnership()).revertedWith('NOT_OWNER');
    await distr.connect(signer2).acceptOwnership()
    expect(await distr.owner()).eq(signer2.address)
    await expect(distr.offerOwnership(signer2.address)).revertedWith('NOT_OWNER');
  })

  it("manualNotify test", async () => {
    await token.approve(distr.address, 1000)
    const veDist = await distr.veDist();

    await distr.manualNotify(1000, true)
    expect(await token.balanceOf(veDist)).eq(500);

    await distr.manualNotify(0, false)
    expect(await token.balanceOf(veDist)).eq(1000);
  })

  it("autoNotify test", async () => {
    const bal = await token.balanceOf(signer.address);
    await token.approve(distr.address, bal)
    const veDist = await distr.veDist();

    await distr.autoNotify()
    expect(await token.balanceOf(veDist)).eq(bal.div(2));

    await distr.autoNotify()
    expect(await token.balanceOf(veDist)).eq(bal);
  })
})
