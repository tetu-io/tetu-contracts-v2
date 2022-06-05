import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal,
  SlotsTest,
  SlotsTest2,
  SlotsTest2__factory,
  SlotsTest__factory
} from "../../typechain";
import {formatBytes32String} from "ethers/lib/utils";
import {TimeUtils} from "../TimeUtils";

describe("Slots Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let slotsTest: SlotsTest;
  let controller: ControllerMinimal;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    controller = await DeployerUtils.deployMockController(signer);

    const proxy = await DeployerUtils.deployProxy(signer, 'SlotsTest');
    slotsTest = SlotsTest__factory.connect(proxy, signer);
    await slotsTest.initialize(controller.address);

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


  it("Slots returns same as sets after proxy upgrade", async () => {
    const values = [11, 22, 33, 44, 55];
    for (let i = 0; i < values.length; i++) {
      console.log('set A', i, values[i]);
      await slotsTest.setMapA(i, values[i]);
    }

    console.log('deploy SlotsTest2 logic');
    const slotsTest2Impl = await DeployerUtils.deployContract(signer, 'SlotsTest2') as SlotsTest2;
    await controller.updateProxies([slotsTest.address], [slotsTest2Impl.address]);
    const slotsTest2 = SlotsTest2__factory.connect(slotsTest.address, signer);

    // write to new B member to check A will not rewrite
    const mulB = 100;
    for (let i = 0; i < values.length; i++) {
      const val = values[i] * mulB;
      console.log('set B', i, val);
      await slotsTest2.setMapB(i, val);
    }

    for (let i = 0; i < values.length; i++) {
      const slotStruct = await slotsTest2.map(i);
      console.log('get struct', i, slotStruct);
      expect(slotStruct.a).is.eq(values[i])
      expect(slotStruct.b).is.eq(values[i] * mulB)
    }

  });

  it("byte32 test", async () => {
    await slotsTest.setByte32(formatBytes32String('test'))
    expect(await slotsTest.getBytes32()).eq(formatBytes32String('test'))
  });

  it("address test", async () => {
    await slotsTest.setAddress(signer.address)
    expect(await slotsTest.getAddress()).eq(signer.address)
  });

  it("uint test", async () => {
    await slotsTest.setUint(11)
    expect(await slotsTest.getUint()).eq(11)
  });

  it("array length test", async () => {
    await slotsTest.setLength(11)
    expect(await slotsTest.arrayLength()).eq(11)
  });

  it("array address test", async () => {
    await slotsTest["setAt(uint256,address)"](1, signer.address)
    expect(await slotsTest.addressAt(1)).eq(signer.address)
  });

  it("array uint test", async () => {
    await slotsTest["setAt(uint256,uint256)"](1, 11)
    expect(await slotsTest.uintAt(1)).eq(11)
  });

  it("array push test", async () => {
    await slotsTest.push(signer.address)
    expect(await slotsTest.addressAt(0)).eq(signer.address)
  });

})
