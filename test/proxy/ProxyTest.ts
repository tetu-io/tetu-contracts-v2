import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal, ProxyControlled, ProxyControlled__factory,
  SlotsTest,
  SlotsTest2,
  SlotsTest2__factory,
  SlotsTest__factory
} from "../../typechain";
import {formatBytes32String} from "ethers/lib/utils";
import {TimeUtils} from "../TimeUtils";

describe("Proxy Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let controller: ControllerMinimal;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    controller = await DeployerUtils.deployMockController(signer);
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


  it("update proxy with non-contract revert", async () => {
    const logic = await DeployerUtils.deployContract(signer, 'SlotsTest');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const slotsTest = SlotsTest__factory.connect(proxy.address, signer);
    await slotsTest.initialize(controller.address);
    await expect(controller.updateProxies([slotsTest.address], [signer.address]))
      .revertedWith('UpgradeableProxy: new implementation is not a contract');
  });

  it("check implementation test", async () => {
    const logic = await DeployerUtils.deployContract(signer, 'SlotsTest');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const slotsTest = SlotsTest__factory.connect(proxy.address, signer);
    await slotsTest.initialize(controller.address);

    expect(await ProxyControlled__factory.connect(proxy.address, signer).implementation()).eq(logic.address)

    await expect(proxy.initProxy(logic.address)).revertedWith('Already inited');
  });

  it("create proxy with not controllable contract revert", async () => {
    const logic = await DeployerUtils.deployContract(signer, 'MockToken', '1', '2', 8);
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await expect(proxy.initProxy(logic.address)).revertedWith('');
  });

  it("upgrade from not controller revert", async () => {
    const logic = await DeployerUtils.deployContract(signer, 'SlotsTest');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const slotsTest = SlotsTest__factory.connect(proxy.address, signer);
    await slotsTest.initialize(controller.address);

    await expect(proxy.upgrade(signer.address)).revertedWith('Proxy: Forbidden')
  });

  it("upgrade with wrong impl revert", async () => {
    const logic = await DeployerUtils.deployContract(signer, 'SlotsTest');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const slotsTest = SlotsTest__factory.connect(proxy.address, signer);
    await slotsTest.initialize(controller.address);

    const newLogic = await DeployerUtils.deployContract(signer, 'Multicall');
    await expect(controller.updateProxies([slotsTest.address], [newLogic.address]))
      .revertedWith('');
  });

})
