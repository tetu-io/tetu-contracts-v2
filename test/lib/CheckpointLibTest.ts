import {ethers, network} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  Base64Test,
  CheckpointLibTest,
  SlotsTest,
  SlotsTest2,
  SlotsTest2__factory,
  SlotsTest__factory
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";

describe("CheckpointLibTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let helper: CheckpointLibTest;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    helper = await DeployerUtils.deployContract(signer, 'CheckpointLibTest') as CheckpointLibTest;
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
    await expect(helper.findLowerIndex(0, 0)).revertedWith('Empty checkpoints');
  });

})
