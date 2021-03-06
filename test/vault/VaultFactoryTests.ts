import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal,
  IERC20__factory,
  MockGauge,
  MockToken,
  ProxyControlled,
  TetuVaultV2__factory,
  VaultFactory
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Vault factory tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let controller: ControllerMinimal;
  let usdc: MockToken;
  let vaultFactory: VaultFactory;
  let mockGauge: MockGauge;


  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    const vaultLogic = await DeployerUtils.deployContract(signer, 'TetuVaultV2');
    const insurance = await DeployerUtils.deployContract(signer, 'VaultInsurance');
    const splitter = await DeployerUtils.deployContract(signer, 'MockSplitter');


    vaultFactory = await DeployerUtils.deployContract(signer, 'VaultFactory', controller.address,
      vaultLogic.address, insurance.address, splitter.address) as VaultFactory;

    mockGauge = await DeployerUtils.deployContract(signer, 'MockGauge', controller.address) as MockGauge;
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

  it("deploy test", async () => {
    expect(await vaultFactory.deployedVaultsLength()).eq(0);
    const tx = await vaultFactory.createVault(
      usdc.address,
      'tetu vault',
      'xUSDC',
      mockGauge.address,
      10
    );
    expect((await tx.wait()).gasUsed).below(3527299);
    expect(await vaultFactory.deployedVaultsLength()).eq(1);

    const vaultAdr = await vaultFactory.deployedVaults(0);
    await enterAndExitTOVault(signer, vaultAdr);
    await enterAndExitTOVault(signer, vaultAdr);
    await vaultFactory.createVault(
      usdc.address,
      'tetu vault2',
      'xUSDC2',
      mockGauge.address,
      10
    );
    const vaultAdr2 = await vaultFactory.deployedVaults(0);
    await enterAndExitTOVault(signer, vaultAdr2);
    await enterAndExitTOVault(signer, vaultAdr2);
  });

  it("deploy from not op revert", async () => {
    await expect(vaultFactory.connect(signer2).createVault(
      usdc.address,
      'tetu vault2',
      'xUSDC2',
      mockGauge.address,
      10
    )).revertedWith('!OPERATOR');
  });

  it("set vault test", async () => {
    await vaultFactory.setVaultImpl(Misc.ZERO_ADDRESS);
    expect(await vaultFactory.vaultImpl()).eq(Misc.ZERO_ADDRESS);
  });

  it("set vault revert", async () => {
    await expect(vaultFactory.connect(signer2).setVaultImpl(Misc.ZERO_ADDRESS)).revertedWith('!GOV');
  });

  it("set insurance test", async () => {
    await vaultFactory.setVaultInsuranceImpl(Misc.ZERO_ADDRESS);
    expect(await vaultFactory.vaultInsuranceImpl()).eq(Misc.ZERO_ADDRESS);
  });

  it("set insurance revert", async () => {
    await expect(vaultFactory.connect(signer2).setVaultInsuranceImpl(Misc.ZERO_ADDRESS)).revertedWith('!GOV');
  });

  it("set splitter test", async () => {
    await vaultFactory.setSplitterImpl(Misc.ZERO_ADDRESS);
    expect(await vaultFactory.splitterImpl()).eq(Misc.ZERO_ADDRESS);
  });

  it("set splitter revert", async () => {
    await expect(vaultFactory.connect(signer2).setSplitterImpl(Misc.ZERO_ADDRESS)).revertedWith('!GOV');
  });

});

async function enterAndExitTOVault(signer: SignerWithAddress, vaultAdr: string) {
  const vault = TetuVaultV2__factory.connect(vaultAdr, signer);
  const asset = await vault.asset();
  const token = IERC20__factory.connect(asset, signer);
  await token.approve(vaultAdr, Misc.MAX_UINT);
  const bal = await token.balanceOf(signer.address);
  await vault.deposit(parseUnits('1', 6), signer.address);
  await vault.withdraw(parseUnits('1', 6), signer.address, signer.address);
  expect(await token.balanceOf(signer.address)).eq(bal);
}
