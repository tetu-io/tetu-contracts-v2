import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {DepositHelper, IERC20__factory, MockToken, MockVault, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {expect} from "chai";
import {Misc} from "../../scripts/utils/Misc";

describe("Deposit helper Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;
  let strategy: SignerWithAddress;


  let token: MockToken;
  let token2: MockToken;
  let vault: MockVault;
  let helper: DepositHelper;
  let ve: VeTetu;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, strategy, signer2] = await ethers.getSigners();

    const controller = await DeployerUtils.deployMockController(signer);
    token = await DeployerUtils.deployMockToken(signer);
    token2 = await DeployerUtils.deployMockToken(signer);
    vault = await DeployerUtils.deployMockVault(signer, controller.address, token.address, 'V', strategy.address, 1);
    helper = await DeployerUtils.deployContract(signer, 'DepositHelper', token.address) as DepositHelper;

    ve = await DeployerUtils.deployVeTetu(signer, token.address, controller.address);

    await token.connect(strategy).approve(vault.address, 99999999999);

    await token.approve(vault.address, 10000);
    await vault.deposit(10000, signer.address);
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


  it("test deposit", async () => {
    await token.approve(helper.address, 100)
    await helper.deposit(vault.address, token.address, 100, 99)
    expect(await vault.balanceOf(signer.address)).eq(8999);

    await token.approve(helper.address, 100)
    await expect(helper.deposit(vault.address, token.address, 100, 101)).to.be.revertedWith('SLIPPAGE')

    await token.approve(helper.address, 100)
    await helper.deposit(vault.address, token.address, 100, 99)
    expect(await vault.balanceOf(signer.address)).eq(9098);

    await IERC20__factory.connect(vault.address, signer).approve(helper.address, 198)
    await expect(helper.withdraw(vault.address, 198, 199)).to.be.revertedWith('SLIPPAGE')

    const balanceBefore = await token.balanceOf(signer.address)
    await helper.withdraw(vault.address, 198, 198)
    expect((await token.balanceOf(signer.address)).sub(balanceBefore)).eq(198);
  });

  it("test create lock", async () => {
    await token.approve(helper.address, 1000)
    await helper.createLock(ve.address, token.address, 1000, 60 * 60 * 24 * 30);
    expect((await ve.lockedAmounts(1, token.address))).eq(1000);
  });

  it("test increase amount", async () => {
    await token.approve(helper.address, 1000)
    await helper.createLock(ve.address, token.address, 1000, 60 * 60 * 24 * 30);
    await token.approve(helper.address, 1000)
    await helper.increaseAmount(ve.address, token.address, 1, 1000);
    expect((await ve.lockedAmounts(1, token.address))).eq(2000);
  });

})
