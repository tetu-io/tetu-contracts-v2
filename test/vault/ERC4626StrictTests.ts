import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ERC4626Strict,
  MockStrategyStrict,
  MockToken,
  ProxyControlled,
  TetuVaultV2
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("ERC4626Strict tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let usdc: MockToken;
  let tetu: MockToken;
  let vault: ERC4626Strict;
  let strategy: MockStrategyStrict;

  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    await usdc.transfer(signer2.address, parseUnits('1', 6));

    strategy = await DeployerUtils.deployContract(signer, 'MockStrategyStrict') as MockStrategyStrict;
    vault = await DeployerUtils.deployContract(
      signer,
      'ERC4626Strict',
      usdc.address,
      'USDC',
      'USDC',
      strategy.address,
      0) as ERC4626Strict;

    await strategy.init(vault.address);

    await usdc.connect(signer2).approve(vault.address, Misc.MAX_UINT);
    await usdc.connect(signer1).approve(vault.address, Misc.MAX_UINT);
    await usdc.approve(vault.address, Misc.MAX_UINT);
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

  it("decimals test", async () => {
    expect(await vault.decimals()).eq(6);
  });

  it("deposit revert on zero test", async () => {
    await expect(vault.deposit(0, signer.address)).revertedWith('ZERO_SHARES');
  });

  it("previewDeposit test", async () => {
    expect(await vault.previewDeposit(100)).eq(100);
  });

  it("previewMint test", async () => {
    expect(await vault.previewMint(100)).eq(100);
  });

  it("previewWithdraw test", async () => {
    expect(await vault.previewWithdraw(10000)).eq(10000);
  });

  it("previewRedeem test", async () => {
    expect(await vault.previewRedeem(100)).eq(100);
  });

  it("maxDeposit test", async () => {
    expect(await vault.maxDeposit(signer.address)).eq(Misc.MAX_UINT_MINUS_ONE);
  });

  it("maxMint test", async () => {
    expect(await vault.maxMint(signer.address)).eq(Misc.MAX_UINT_MINUS_ONE);
  });

  it("maxWithdraw test", async () => {
    expect(await vault.maxWithdraw(signer.address)).eq(0);
  });

  it("maxRedeem test", async () => {
    expect(await vault.maxRedeem(signer.address)).eq(0);
  });

  it("max withdraw revert", async () => {
    await expect(vault.withdraw(Misc.MAX_UINT, signer.address, signer.address)).revertedWith('MAX')
  });

  it("withdraw not owner revert", async () => {
    await expect(vault.withdraw(100, signer.address, signer1.address)).revertedWith('')
  });

  it("withdraw not owner test", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    expect(await vault.sharePrice()).eq(parseUnits('1', 6))
    await vault.approve(signer1.address, parseUnits('1', 6));
    await vault.connect(signer1).withdraw(parseUnits('0.1', 6), signer1.address, signer.address);
  });

  it("withdraw not owner with max approve test", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    await vault.approve(signer1.address, Misc.MAX_UINT);
    await vault.connect(signer1).withdraw(parseUnits('0.1', 6), signer1.address, signer.address);
  });

  it("deposit and withdraw all", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    expect(await vault.balanceOf(signer.address)).eq(parseUnits('1', 6));
    await vault.withdrawAll();
    expect(await vault.balanceOf(signer.address)).eq(0);
  });

  it("deposit when strategy has funds", async () => {
    const s = await DeployerUtils.deployContract(signer, 'MockStrategyStrict') as MockStrategyStrict;
    const v = await DeployerUtils.deployContract(
      signer,
      'ERC4626Strict',
      usdc.address,
      'USDC',
      'USDC',
      s.address,
      1_000);
    await s.init(v.address);
    await usdc.approve(v.address, Misc.MAX_UINT);
    await usdc.approve(s.address, parseUnits('1', 6));
    await usdc.transfer(s.address, parseUnits('1', 6));
    await v.deposit(parseUnits('1', 4), signer.address)
    expect(await v.balanceOf(signer.address)).eq(parseUnits('1', 4));
    expect(await usdc.balanceOf(s.address)).eq(parseUnits('1', 6));
  });


  it("max redeem revert", async () => {
    await expect(vault.redeem(Misc.MAX_UINT, signer.address, signer.address)).revertedWith('MAX')
  });

  it("redeem not owner revert", async () => {
    await expect(vault.redeem(100, signer.address, signer1.address)).revertedWith('')
  });

  it("redeem not owner test", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    await vault.approve(signer1.address, parseUnits('1', 6));
    await vault.connect(signer1).redeem(parseUnits('0.1', 6), signer1.address, signer.address);
  });

  it("redeem not owner with max approve test", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    await vault.approve(signer1.address, Misc.MAX_UINT);
    await vault.connect(signer1).redeem(parseUnits('0.1', 6), signer1.address, signer.address);
  });

  it("redeem zero revert", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    await expect(vault.redeem(0, signer.address, signer.address)).revertedWith('ZERO_ASSETS')
  });

  it("init wrong buffer revert", async () => {
    const logic = await DeployerUtils.deployContract(signer, 'TetuVaultV2') as TetuVaultV2;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    await expect(DeployerUtils.deployContract(
      signer,
      'ERC4626Strict',
      usdc.address,
      'USDC',
      'USDC',
      strategy.address,
      10000000)).revertedWith("!BUFFER");
  });

  it("set buffer test", async () => {
    const s = await DeployerUtils.deployContract(signer, 'MockStrategyStrict') as MockStrategyStrict;
    const v = await DeployerUtils.deployContract(
      signer,
      'ERC4626Strict',
      usdc.address,
      'USDC',
      'USDC',
      s.address,
      1_000);
    await s.init(v.address);
    await usdc.approve(v.address, Misc.MAX_UINT);
    await v.deposit(parseUnits('1', 6), signer.address)
    expect(await usdc.balanceOf(v.address)).eq(10_000);
    await v.deposit(100, signer.address)
    expect(await usdc.balanceOf(v.address)).eq(10001);
  });

  it("not invest on deposit", async () => {
    const s = await DeployerUtils.deployContract(signer, 'MockStrategyStrict') as MockStrategyStrict;
    const v = await DeployerUtils.deployContract(
      signer,
      'ERC4626Strict',
      usdc.address,
      'USDC',
      'USDC',
      s.address,
      1_000);
    await s.init(v.address);
    await usdc.approve(v.address, Misc.MAX_UINT);
    await v.deposit(parseUnits('1', 6), signer.address)
    expect(await usdc.balanceOf(v.address)).eq(10_000);
  });

  it("simple mint/withdraw test", async () => {
    await vault.mint(parseUnits('1', 6), signer.address);
    await vault.withdraw(parseUnits('1', 6), signer.address, signer.address);
  });

  it("simple maxDeposit test", async () => {
    expect(await vault.maxDeposit(signer.address)).eq(Misc.MAX_UINT_MINUS_ONE);
  });

  it("simple maxMint test", async () => {
    expect(await vault.maxMint(signer.address)).eq(Misc.MAX_UINT_MINUS_ONE);
  });

  it("simple maxWithdraw test", async () => {
    expect(await vault.maxWithdraw(signer.address)).eq(0);
  });

  it("simple maxRedeem test", async () => {
    expect(await vault.maxRedeem(signer.address)).eq(0);
  });

  it("max mint revert", async () => {
    await expect(vault.mint(Misc.MAX_UINT, signer.address)).revertedWith('MAX')
  });

  it("splitter assets test", async () => {
    expect(await vault.strategyAssets()).eq(0);
  });

});
