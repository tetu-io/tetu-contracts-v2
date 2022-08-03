import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Base64Test, DepositHelper, MockToken, MockVault, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {parseUnits} from "ethers/lib/utils";
import {expect} from "chai";
import {address} from "hardhat/internal/core/config/config-validation";
import {BytesLike} from "@ethersproject/bytes";

describe("Deposit helper Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let strategy: SignerWithAddress;


  let token: MockToken;
  let token2: MockToken;
  let vault: MockVault;
  let helper: DepositHelper;
  let ve: VeTetu;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, strategy] = await ethers.getSigners();

    const controller = await DeployerUtils.deployMockController(signer);
    token = await DeployerUtils.deployMockToken(signer);
    token2 = await DeployerUtils.deployMockToken(signer);
    vault = await DeployerUtils.deployMockVault(signer, controller.address, token.address, 'V', strategy.address, 1);
    const ms = await DeployerUtils.deployContract(signer, 'MockMultiswap');
    helper = await DeployerUtils.deployContract(signer, 'DepositHelper', ms.address) as DepositHelper;

    ve = await DeployerUtils.deployVeTetu(signer, token.address, controller.address);

    await token.connect(strategy).approve(vault.address, 99999999999);
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
    await helper.deposit(vault.address, token.address, 100)
    expect(await vault.balanceOf(signer.address)).eq(99);

    await token.approve(helper.address, 100)
    await helper.deposit(vault.address, token.address, 100)
    expect(await vault.balanceOf(signer.address)).eq(198);
  });

  it("test convert and deposit", async () => {
    await token2.approve(helper.address, 100)
    await helper.convertAndDeposit(
      vault.address,
      {
        tokenIn: token2.address,
        tokenOut: token.address,
        swapAmount: 100,
        returnAmount: 0
      },
      [{
        poolId: '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
        assetInIndex: 0,
        assetOutIndex: 0,
        amount: 0,
        userData: '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
      }],
      [],
      0,
      0
    )
    expect(await vault.balanceOf(signer.address)).eq(99);
  });

  it("test withdraw and convert", async () => {
    const bal = await token2.balanceOf(signer.address);
    await token.approve(helper.address, 1000)
    await helper.deposit(vault.address, token.address, 1000)
    await vault.approve(helper.address, 990)
    await helper.withdrawAndConvert(
      vault.address,
      990,
      {
        tokenIn: token.address,
        tokenOut: token2.address,
        swapAmount: 0,
        returnAmount: 0
      },
      [{
        poolId: '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
        assetInIndex: 0,
        assetOutIndex: 0,
        amount: 0,
        userData: '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
      }],
      [],
      0,
      0
    )
    expect((await token2.balanceOf(signer.address)).sub(bal)).eq(990);
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
