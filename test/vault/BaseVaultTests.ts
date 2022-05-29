import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {MockToken, MockVault} from "../../typechain";
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
  let stubStrategy: SignerWithAddress;
  let usdc: MockToken;
  let vault: MockVault;

  before(async function () {
    [signer, signer1, signer2, stubStrategy] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    const controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    await usdc.transfer(signer2.address, parseUnits('1', 6));

    vault = await DeployerUtils.deployMockVault(signer,
      controller.address,
      usdc.address,
      'USDC',
      stubStrategy.address,
      10
    );
    await usdc.connect(stubStrategy).approve(vault.address, Misc.MAX_UINT);
    await usdc.connect(signer2).approve(vault.address, Misc.MAX_UINT);
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

  it("deposit/withdraw test", async () => {
    const amount = parseUnits('1', 6);

    const tx = await vault.deposit(amount, signer2.address)
    const rec = await tx.wait();
    expect(rec.gasUsed).eq(158308)

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

});
