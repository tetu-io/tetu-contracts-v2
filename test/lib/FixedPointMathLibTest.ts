import {ethers, network} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  Base64Test, FixedPointMathLibTest,
  SlotsTest,
  SlotsTest2,
  SlotsTest2__factory,
  SlotsTest__factory
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";

describe("Base64 Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let helper: FixedPointMathLibTest;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    helper = await DeployerUtils.deployContract(signer, 'FixedPointMathLibTest') as FixedPointMathLibTest;
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


  it("mulWadDown test", async () => {
    expect(await helper.mulWadDown(3, 2)).eq(0);
  });

  it("mulWadUp test", async () => {
    expect(await helper.mulWadUp(3, 2)).eq(1);
  });

  it("rpow test", async () => {
    expect(await helper.rpow(3, 2, 1)).eq(9);
  });

  it("sqrt test", async () => {
    expect(await helper.sqrt(9)).eq(3);
  });

})
