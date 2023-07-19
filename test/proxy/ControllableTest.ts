import {ethers, network} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  Base64Test, ControllableTest, ControllableTest__factory, ControllerMinimal,
  SlotsTest,
  SlotsTest2,
  SlotsTest2__factory,
  SlotsTest__factory
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {Misc} from "../../scripts/utils/Misc";

describe("Controllable Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let helper: ControllableTest;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    helper = ControllableTest__factory.connect(await DeployerUtils.deployProxy(signer, 'ControllableTest'), signer);
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


  it("zero governance revert", async () => {
    const controller = await DeployerUtils.deployContract(signer, 'ControllerMinimal', Misc.ZERO_ADDRESS) as ControllerMinimal;
    await expect(helper.init(controller.address)).revertedWith('Zero governance');
  });

  it("zero controller revert", async () => {
    await expect(helper.init(Misc.ZERO_ADDRESS)).revertedWith('Zero controller');
  });

  it("revision test", async () => {
    await helper.increase();
    expect(await helper.revision()).eq(1);
  });

  it("prev impl test", async () => {
    await helper.increase();
    expect(await helper.previousImplementation()).eq(helper.address);
  });

  it("created block test", async () => {
    const controller = await DeployerUtils.deployContract(signer, 'ControllerMinimal', signer.address) as ControllerMinimal;
    await helper.init(controller.address);
    expect(await helper.createdBlock()).above(0);
    expect(await helper.created()).above(0);
  });

  it("increase rev revert test", async () => {
    await expect(helper.increaseRevision(Misc.ZERO_ADDRESS)).revertedWith('Increase revision forbidden');
  });

  it("read private variable", async () => {
    const controller = await DeployerUtils.deployContract(signer, 'ControllerMinimal', signer.address) as ControllerMinimal;
    await helper.init(controller.address);
    const bytes32Result = await helper.getSlot(1)
    const bytes32Expected = ethers.utils.hexZeroPad(ethers.utils.hexlify(333), 32)
    expect(bytes32Result).eq(bytes32Expected);
  });
})
