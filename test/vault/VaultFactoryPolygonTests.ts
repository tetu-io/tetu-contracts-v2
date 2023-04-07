import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import hre, {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {VaultFactory, VaultFactory__factory} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {Addresses} from "../../scripts/addresses/addresses";
import {PolygonAddresses} from "../../scripts/addresses/polygon";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Vault factory tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let gov: SignerWithAddress;
  let core: CoreAddresses;
  let factory: VaultFactory;


  before(async function () {
    [signer] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();
    if (hre.network.config.chainId !== 137) {
      return;
    }

    gov = await Misc.impersonate(PolygonAddresses.GOVERNANCE);

    core = Addresses.getCore();
    factory = VaultFactory__factory.connect(core.vaultFactory, gov);
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

  it("set vault logic", async () => {
    if (hre.network.config.chainId !== 137) {
      return;
    }
    console.log('factory', factory.address);
    const vaultLogic = await DeployerUtils.deployContract(signer, 'TetuVaultV2');
    await factory.setVaultImpl(vaultLogic.address);
    expect(await factory.vaultImpl()).to.be.eq(vaultLogic.address);
  });

  it("set splitter logic", async () => {
    if (hre.network.config.chainId !== 137) {
      return;
    }
    const splitter = await DeployerUtils.deployContract(signer, 'StrategySplitterV2');
    await factory.setSplitterImpl(splitter.address);
    expect(await factory.splitterImpl()).to.be.eq(splitter.address);
  });


});
