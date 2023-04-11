import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {PerfFeeTreasury,} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("PerfFeeTreasuryTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;

  let treasury: PerfFeeTreasury;


  before(async function () {
    this.timeout(1200000);
    snapshotBefore = await TimeUtils.snapshot();
    [signer, signer2] = await ethers.getSigners();

    treasury = await DeployerUtils.deployContract(signer, "PerfFeeTreasury", signer.address) as PerfFeeTreasury;
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

  it("set new gov", async () => {
    await expect(treasury.connect(signer2).offerOwnership(signer2.address)).revertedWith('NOT_GOV');
    await treasury.offerOwnership(signer2.address)
    await expect(treasury.acceptOwnership()).revertedWith('NOT_GOV');
    await treasury.connect(signer2).acceptOwnership()
    expect(await treasury.governance()).eq(signer2.address)
    await expect(treasury.offerOwnership(signer2.address)).revertedWith('NOT_GOV');
  })

  it("claim", async () => {
    const token = await DeployerUtils.deployMockToken(signer);
    const token2 = await DeployerUtils.deployMockToken(signer);

    await token.transfer(treasury.address, 1000)
    await token2.transfer(treasury.address, 500)

    expect(await token.balanceOf(treasury.address)).eq(1000);
    expect(await token2.balanceOf(treasury.address)).eq(500);

    await expect(treasury.connect(signer2).claim([token.address, token2.address])).revertedWith('NOT_GOV');
    await treasury.claim([token.address, token2.address]);

    expect(await token.balanceOf(treasury.address)).eq(0);
    expect(await token2.balanceOf(treasury.address)).eq(0);
  })
})
