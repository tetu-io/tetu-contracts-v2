
import {ethers, network} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {SlotsTest, SlotsTest2, SlotsTest2__factory, SlotsTest__factory} from "../../typechain";

describe("Various Slots Tests", function () {
  let signer: SignerWithAddress;
  let slotsTest2Impl: SlotsTest;
  let slotsTest: SlotsTest;
  let slotsTest2: SlotsTest2;
  let deployAndUpgradeLogic2: () => Promise<void>;

  before(async function () {
    [signer] = await ethers.getSigners();
    const controller = await DeployerUtils.deployMockController(signer);

    const proxy = await DeployerUtils.deployProxy(signer, 'SlotsTest');
    slotsTest = SlotsTest__factory.connect(proxy, signer);
    await slotsTest.initialize(controller.address);

    deployAndUpgradeLogic2 = async function() {
      console.log('deploy SlotsTest2 logic');
      slotsTest2Impl = await DeployerUtils.deployContract(signer, 'SlotsTest2') as SlotsTest2;
      await controller.updateProxies([slotsTest.address], [slotsTest2Impl.address]);
      slotsTest2= SlotsTest2__factory.connect(slotsTest.address, signer);
    }

  });

  after(async function () {
  });

  beforeEach(async function () {
  });

  afterEach(async function () {
  });


  it("Slots returns same as sets after proxy upgrade", async () => {
    const values = [11,22,33,44,55];
    for (let i = 0; i < values.length; i++) {
      console.log('set A', i, values[i]);
      await slotsTest.setMapA(i, values[i]);
    }

    await deployAndUpgradeLogic2();

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

})
