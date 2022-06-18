import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {
  ControllerV2,
  IProxyControlled,
  IProxyControlled__factory,
  ProxyControlled__factory
} from "../../typechain";


const {expect} = chai;

const LOCK = 60 * 60 * 18;

describe("controller v2 tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;
  let signer3: SignerWithAddress;

  let controller: ControllerV2;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, signer2, signer3] = await ethers.getSigners();

    controller = await DeployerUtils.deployController(signer);
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

  // ********** ADDRESS CHANGE *****

  it("change governance test", async function () {
    await controller.announceAddressChange(1, signer2.address);
    expect((await controller.addressAnnouncesList())[0]._type).eq(1)
    expect((await controller.addressAnnouncesList())[0].newAddress).eq(signer2.address)
    expect((await controller.addressAnnouncesList())[0].timeLockAt).above(0)
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(1);
    expect(await controller.governance()).eq(signer2.address);
    expect((await controller.addressAnnouncesList()).length).eq(0)
  });

  it("change voter test", async function () {
    await controller.announceAddressChange(2, signer2.address);
    await controller.changeAddress(2);
    expect(await controller.voter()).eq(signer2.address);

    await controller.announceAddressChange(2, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(2);
    expect(await controller.voter()).eq(signer.address);
  });

  it("change vault controller test", async function () {
    await controller.announceAddressChange(3, signer2.address);
    await controller.changeAddress(3);
    expect(await controller.vaultController()).eq(signer2.address);

    await controller.announceAddressChange(3, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(3);
    expect(await controller.vaultController()).eq(signer.address);
  });

  it("change liquidator test", async function () {
    await controller.announceAddressChange(4, signer2.address);
    await controller.changeAddress(4);
    expect(await controller.liquidator()).eq(signer2.address);

    await controller.announceAddressChange(4, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(4);
    expect(await controller.liquidator()).eq(signer.address);
  });

  it("change forwarder test", async function () {
    await controller.announceAddressChange(5, signer2.address);
    await controller.changeAddress(5);
    expect(await controller.forwarder()).eq(signer2.address);

    await controller.announceAddressChange(5, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(5);
    expect(await controller.forwarder()).eq(signer.address);
  });

  it("change investFund test", async function () {
    const type = 6;
    await controller.announceAddressChange(type, signer2.address);
    await controller.changeAddress(type);
    expect(await controller.investFund()).eq(signer2.address);

    await controller.announceAddressChange(type, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(type);
    expect(await controller.investFund()).eq(signer.address);
  });

  it("change veDistributor test", async function () {
    const type = 7;
    await controller.announceAddressChange(type, signer2.address);
    await controller.changeAddress(type);
    expect(await controller.veDistributor()).eq(signer2.address);

    await controller.announceAddressChange(type, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(type);
    expect(await controller.veDistributor()).eq(signer.address);
  });

  it("change platformVoter test", async function () {
    const type = 8;
    await controller.announceAddressChange(type, signer2.address);
    await controller.changeAddress(type);
    expect(await controller.platformVoter()).eq(signer2.address);

    await controller.announceAddressChange(type, signer.address);
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.changeAddress(type);
    expect(await controller.platformVoter()).eq(signer.address);
  });

  it("change address already announced revert", async function () {
    await controller.announceAddressChange(1, signer2.address);
    await expect(controller.announceAddressChange(1, signer2.address)).revertedWith('ANNOUNCED');
  });

  it("change address not announced revert", async function () {
    await expect(controller.changeAddress(1)).revertedWith('EnumerableMap: nonexistent key');
  });

  it("change address unknown revert", async function () {
    await controller.announceAddressChange(0, signer2.address);
    await expect(controller.changeAddress(0)).revertedWith('UNKNOWN');
  });

  it("change address too early revert", async function () {
    await controller.announceAddressChange(1, signer2.address);
    await expect(controller.changeAddress(1)).revertedWith('LOCKED');
  });

  it("announce zero address revert", async function () {
    await expect(controller.announceAddressChange(1, Misc.ZERO_ADDRESS)).revertedWith('ZERO_VALUE');
  });

  it("announce not gov revert", async function () {
    await expect(controller.connect(signer2).announceAddressChange(1, Misc.ZERO_ADDRESS)).revertedWith('DENIED');
  });

  it("change adr not gov revert", async function () {
    await expect(controller.connect(signer2).changeAddress(1)).revertedWith('DENIED');
  });

  // ********** PROXY UPDATE *****

  it("proxy upgrade test", async function () {
    const logic = await DeployerUtils.deployContract(signer, 'ControllerV2');
    await controller.announceProxyUpgrade([controller.address], [logic.address]);
    expect((await controller.proxyAnnouncesList())[0].proxy).eq(controller.address)
    expect((await controller.proxyAnnouncesList())[0].implementation).eq(logic.address)
    expect((await controller.proxyAnnouncesList())[0].timeLockAt).above(0)
    await TimeUtils.advanceBlocksOnTs(LOCK);
    await controller.upgradeProxy([controller.address]);
    expect(await ProxyControlled__factory.connect(controller.address, signer).implementation()).eq(logic.address);
    expect((await controller.proxyAnnouncesList()).length).eq(0)
  });

  it("proxy upgrade already announcer revert", async function () {
    await controller.announceProxyUpgrade([controller.address], [signer2.address]);
    await expect(controller.announceProxyUpgrade([controller.address], [signer2.address])).revertedWith('ANNOUNCED');
  });

  it("proxy upgrade not announced revert", async function () {
    await expect(controller.upgradeProxy([controller.address])).revertedWith('EnumerableMap: nonexistent key');
  });

  it("proxy upgrade zero adr revert", async function () {
    await expect(controller.announceProxyUpgrade([controller.address],[Misc.ZERO_ADDRESS])).revertedWith('ZERO_IMPL');
  });

  it("proxy upgrade early revert", async function () {
    await controller.announceProxyUpgrade([controller.address], [signer2.address]);
    await expect(controller.upgradeProxy([controller.address])).revertedWith('LOCKED');
  });

  it("announce proxy not gov revert", async function () {
    await expect(controller.connect(signer2).announceProxyUpgrade([], [])).revertedWith('DENIED');
  });

  it("change adr not gov revert", async function () {
    await expect(controller.connect(signer2).upgradeProxy([])).revertedWith('DENIED');
  });

  // ********** register actions *****

  it("add vault test", async function () {
    await controller.registerVault(signer2.address);
    expect(await controller.vaults(0)).eq(signer2.address);
    expect(await controller.vaultsListLength()).eq(1);
    expect(await controller.isValidVault(signer2.address)).eq(true);
    expect((await controller.vaultsList())[0]).eq(signer2.address);
  });

  it("remove vault test", async function () {
    await controller.registerVault(signer2.address);
    expect(await controller.vaults(0)).eq(signer2.address);
    expect(await controller.vaultsListLength()).eq(1);
    expect((await controller.vaultsList())[0]).eq(signer2.address);
    await controller.removeVault(signer2.address);
    expect(await controller.vaultsListLength()).eq(0);
    expect(await controller.isValidVault(signer2.address)).eq(false);
  });

  it("register vault not gov revert", async function () {
    await expect(controller.connect(signer2).registerVault(signer2.address)).revertedWith('DENIED');
  });

  it("remove vault not gov revert", async function () {
    await expect(controller.connect(signer2).removeVault(signer2.address)).revertedWith('DENIED');
  });

  it("add vault exist revert", async function () {
    await controller.registerVault(signer2.address);
    await expect(controller.registerVault(signer2.address)).revertedWith('EXIST');
  });

  it("remove vault not exist revert", async function () {
    await expect(controller.removeVault(signer2.address)).revertedWith('NOT_EXIST');
  });

  it("add operator exist revert", async function () {
    await controller.registerOperator(signer2.address);
    await expect(controller.registerOperator(signer2.address)).revertedWith('EXIST');
  });

  it("remove operator not exist revert", async function () {
    await expect(controller.removeOperator(signer2.address)).revertedWith('NOT_EXIST');
  });

  it("register operator not gov revert", async function () {
    await expect(controller.connect(signer2).registerOperator(signer2.address)).revertedWith('DENIED');
  });

  it("remove operator not gov revert", async function () {
    await expect(controller.connect(signer2).removeOperator(signer2.address)).revertedWith('DENIED');
  });

  it("add operator test", async function () {
    await controller.registerOperator(signer2.address);
    expect((await controller.operatorsList()).length).eq(2);
    expect((await controller.operatorsList())[1]).eq(signer2.address);
    expect(await controller.isOperator(signer2.address)).eq(true);
  });

  it("remove operator test", async function () {
    await controller.registerOperator(signer2.address);
    expect((await controller.operatorsList()).length).eq(2);
    expect((await controller.operatorsList())[1]).eq(signer2.address);
    expect(await controller.isOperator(signer2.address)).eq(true);
    await controller.removeOperator(signer2.address);
    expect((await controller.operatorsList()).length).eq(1);
    expect(await controller.isOperator(signer2.address)).eq(false);
  });

});
