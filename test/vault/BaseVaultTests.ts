import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal,
  MockToken,
  MockVault,
  MockVaultSimple,
  MockVaultSimple__factory,
  ProxyControlled
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Base Vaults tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let controller: ControllerMinimal;
  let stubStrategy: SignerWithAddress;
  let usdc: MockToken;
  let vault: MockVault;
  let vaultSimple: MockVaultSimple;

  before(async function () {
    [signer, signer1, signer2, stubStrategy] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    await usdc.transfer(signer2.address, parseUnits('1', 6));

    vault = await DeployerUtils.deployMockVault(signer,
      controller.address,
      usdc.address,
      'USDC',
      stubStrategy.address,
      10
    );

    const logic = await DeployerUtils.deployContract(signer, 'MockVaultSimple');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled', logic.address) as ProxyControlled;
    vaultSimple = MockVaultSimple__factory.connect(proxy.address, signer);
    await vaultSimple.init(
      controller.address,
      usdc.address,
      'USDC_MOCK_VAULT',
      'xUSDC',
      {
        gasLimit: 9_000_000
      }
    )

    await usdc.connect(stubStrategy).approve(vault.address, Misc.MAX_UINT);
    await usdc.connect(signer2).approve(vault.address, Misc.MAX_UINT);
    await usdc.approve(vault.address, Misc.MAX_UINT);
    await usdc.approve(vaultSimple.address, Misc.MAX_UINT);


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

  it("deposit/redeem test", async () => {
    const amount = parseUnits('1', 6);

    const tx = await vault.deposit(amount, signer2.address)
    const rec = await tx.wait();
    expect(rec.gasUsed).below(168119)

    const expectedShares = await vault.convertToShares(amount);
    await vault.deposit(amount, signer.address)
    const shares = await vault.balanceOf(signer.address);
    expect(shares).eq(810000);
    expect(shares).eq(expectedShares.mul(9).div(10));
    expect(await vault.convertToAssets(shares)).eq(947368);
    expect(await vault.convertToShares(amount)).eq(855000);

    const expectedAssets = await vault.convertToAssets(shares);
    await vault.redeem(shares, signer1.address, signer.address);
    expect(await vault.balanceOf(signer.address)).eq(0)
    const assets = await usdc.balanceOf(signer1.address);
    expect(assets).eq(852631);
    expect(assets).eq(expectedAssets.mul(9).div(10));

    const vaultBalance = await usdc.balanceOf(vault.address);
    const strategyBalance = await usdc.balanceOf(stubStrategy.address);
    expect(vaultBalance).eq(147369)
    expect(strategyBalance).eq(1000000)
    expect(await vault.totalAssets()).eq(vaultBalance.add(strategyBalance))
    expect(await vault.totalSupply()).eq(900000)

    expect(await vault.convertToShares(amount)).eq(784403);
    expect(await vault.convertToAssets(amount)).eq(1274854);
  });

  it("mint/withdraw test", async () => {
    const assetsAmount = parseUnits('1', 6);

    const tx = await vault.mint(assetsAmount, signer2.address)
    const rec = await tx.wait();
    expect(rec.gasUsed).below(168176)

    const expectedAssets1 = await vault.convertToAssets(assetsAmount);
    await vault.deposit(assetsAmount, signer.address)
    const shares = await vault.balanceOf(signer.address);
    expect(shares).eq(818181);
    expect(await vault.convertToAssets(shares)).eq(944999);
    expect(await vault.convertToShares(expectedAssets1)).eq(952380);

    const expectedAssets2 = await vault.convertToAssets(shares);
    console.log('shares', shares.toString())
    console.log('expectedAssets2', expectedAssets2.toString())
    await vault.withdraw(expectedAssets2.mul(9).div(10), signer1.address, signer.address);
    expect(await vault.balanceOf(signer.address)).eq(0)
    const assets = await usdc.balanceOf(signer1.address);
    expect(assets).eq(850499);
    expect(assets).eq(expectedAssets2.mul(9).div(10));

    const vaultBalance = await usdc.balanceOf(vault.address);
    const strategyBalance = await usdc.balanceOf(stubStrategy.address);
    expect(vaultBalance).eq(199501)
    expect(strategyBalance).eq(1050000)
    expect(await vault.totalAssets()).eq(vaultBalance.add(strategyBalance))
    expect(await vault.totalSupply()).eq(1000000)

    expect(await vault.convertToShares(assetsAmount)).eq(800319);
    expect(await vault.convertToAssets(assetsAmount)).eq(1249501);
  });

  it("decimals test", async () => {
    expect(await vault.decimals()).eq(6);
  });

  it("deposit revert on MAX test", async () => {
    await expect(vault.deposit(Misc.MAX_UINT, signer.address)).revertedWith('MAX');
  });

  it("deposit revert on zero test", async () => {
    await expect(vault.deposit(0, signer.address)).revertedWith('ZERO_SHARES');
  });

  it("previewDeposit test", async () => {
    expect(await vault.previewDeposit(100)).eq(90);
  });

  it("previewMint test", async () => {
    expect(await vault.previewMint(100)).eq(110);
  });

  it("previewWithdraw test", async () => {
    expect(await vault.previewWithdraw(10000)).eq(10000);
  });

  it("previewRedeem test", async () => {
    expect(await vault.previewRedeem(100)).eq(90);
  });

  it("maxDeposit test", async () => {
    expect(await vault.maxDeposit(signer.address)).eq(parseUnits('100'));
  });

  it("maxMint test", async () => {
    expect(await vault.maxMint(signer.address)).eq(parseUnits('100'));
  });

  it("maxWithdraw test", async () => {
    expect(await vault.maxWithdraw(signer.address)).eq(parseUnits('100'));
  });

  it("maxRedeem test", async () => {
    expect(await vault.maxRedeem(signer.address)).eq(parseUnits('100'));
  });

  it("simple deposit/redeem test", async () => {
    await vaultSimple.deposit(parseUnits('1', 6), signer.address);
    await vaultSimple.redeem(parseUnits('1', 6), signer.address, signer.address);
  });

  it("simple mint/withdraw test", async () => {
    await vaultSimple.mint(parseUnits('1', 6), signer.address);
    await vaultSimple.withdraw(parseUnits('1', 6), signer.address, signer.address);
  });

  it("simple maxDeposit test", async () => {
    expect(await vaultSimple.maxDeposit(signer.address)).eq(Misc.MAX_UINT_MINUS_ONE);
  });

  it("simple maxMint test", async () => {
    expect(await vaultSimple.maxMint(signer.address)).eq(Misc.MAX_UINT_MINUS_ONE);
  });

  it("simple maxWithdraw test", async () => {
    expect(await vaultSimple.maxWithdraw(signer.address)).eq(0);
  });

  it("simple maxRedeem test", async () => {
    expect(await vaultSimple.maxRedeem(signer.address)).eq(0);
  });

  it("max mint revert", async () => {
    await expect(vault.mint(Misc.MAX_UINT, signer.address)).revertedWith('MAX')
  });

  it("max withdraw revert", async () => {
    await expect(vault.withdraw(Misc.MAX_UINT, signer.address, signer.address)).revertedWith('MAX')
  });

  it("withdraw not owner revert", async () => {
    await expect(vault.withdraw(100, signer.address, signer1.address)).revertedWith('')
  });

  it("withdraw not owner test", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    await vault.approve(signer1.address, parseUnits('1', 6));
    await vault.connect(signer1).withdraw(parseUnits('0.1', 6), signer1.address, signer.address);
  });

  it("withdraw not owner with max approve test", async () => {
    await vault.deposit(parseUnits('1', 6), signer.address);
    await vault.approve(signer1.address, Misc.MAX_UINT);
    await vault.connect(signer1).withdraw(parseUnits('0.1', 6), signer1.address, signer.address);
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

  it("deposit test", async () => {
    const bal1 = await usdc.balanceOf(signer.address);
    await vault.deposit(parseUnits('1', 6), signer1.address);
    expect(await vault.balanceOf(signer1.address)).eq(900_000);
    expect(bal1.sub(await usdc.balanceOf(signer.address))).eq(parseUnits('1', 6));

    const bal2 = await usdc.balanceOf(signer.address);
    await vault.deposit(parseUnits('1', 6), signer.address);
    expect(await vault.balanceOf(signer.address)).eq(810_000);
    expect(bal2.sub(await usdc.balanceOf(signer.address))).eq(parseUnits('1', 6));
  });

  it("mint test", async () => {
    const bal1 = await usdc.balanceOf(signer.address);
    await vault.mint(900_000, signer1.address);
    expect(await vault.balanceOf(signer1.address)).eq(900_000);
    expect(bal1.sub(await usdc.balanceOf(signer.address))).eq(parseUnits('1', 6));

    const bal2 = await usdc.balanceOf(signer.address);
    await vault.mint(810000, signer.address);
    expect(await vault.balanceOf(signer.address)).eq(810_000);
    expect(bal2.sub(await usdc.balanceOf(signer.address))).eq(parseUnits('1', 6));
  });

  it("withdraw test", async () => {
    await vault.deposit(parseUnits('1', 6), signer1.address);
    await vault.deposit(parseUnits('1', 6), signer.address);

    const shares = await vault.balanceOf(signer.address);
    expect(shares).eq(810_000);

    const assets = await vault.convertToAssets(shares);
    const assetsMinusTax = assets.mul(9).div(10);
    expect(assetsMinusTax).eq(852631);

    const bal1 = await usdc.balanceOf(signer.address);
    const shares1 = await vault.balanceOf(signer.address);
    await vault.withdraw(assetsMinusTax, signer.address, signer.address);
    expect(shares1.sub(await vault.balanceOf(signer.address))).eq(shares);
    expect((await usdc.balanceOf(signer.address)).sub(bal1)).eq(assetsMinusTax);
  });

  it("redeem test", async () => {
    await vault.deposit(parseUnits('1', 6), signer1.address);
    await vault.deposit(parseUnits('1', 6), signer.address);

    const shares = await vault.balanceOf(signer.address);
    expect(shares).eq(810_000);

    const assets = await vault.convertToAssets(shares);
    const assetsMinusTax = assets.mul(9).div(10);
    expect(assetsMinusTax).eq(852631);

    const bal1 = await usdc.balanceOf(signer.address);
    const shares1 = await vault.balanceOf(signer.address);
    await vault.redeem(shares, signer.address, signer.address);
    expect(shares1.sub(await vault.balanceOf(signer.address))).eq(shares);
    expect((await usdc.balanceOf(signer.address)).sub(bal1)).eq(assetsMinusTax);
  });


});
