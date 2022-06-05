import {ethers, network} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  Base64Test,
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

  let helper: Base64Test;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    helper = await DeployerUtils.deployContract(signer, 'Base64Test') as Base64Test;
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


  it("empty data test", async () => {
    await helper.encode('0x')
  });

})
