import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  ControllerV2,
  ControllerV2__factory,
  IControllerV1__factory,
  IERC20,
  IERC20__factory,
  VeTetu,
  VeTetu__factory
} from "../../typechain";
import {LOCK_PERIOD, TimeUtils} from "../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";
import {PolygonAddresses} from "../../scripts/addresses/polygon";
import {Addresses} from "../../scripts/addresses/addresses";
import {expect} from "chai";

describe("VeTetuIntegrationTestPolygon", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let gov: SignerWithAddress;
  let tetuUsdcBpt: IERC20;

  let controller: ControllerV2;
  let ve: VeTetu;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    if (Misc.isNotNetwork(137)) return;

    const govAdr = await ControllerV2__factory.connect(Addresses.getCore().controller, owner).governance()

    gov = await Misc.impersonate(govAdr);
    controller = ControllerV2__factory.connect(Addresses.getCore().controller, gov);
    ve = VeTetu__factory.connect(Addresses.getCore().ve, owner);

    tetuUsdcBpt = IERC20__factory.connect(PolygonAddresses.BALANCER_TETU_USDC, owner);

    // transfer some bpts
    await tetuUsdcBpt.connect(await Misc.impersonate('0x9FB2Eb86aE9DbEBf276A7A67DF1F2D48A49b95EC')).transfer(owner.address, parseUnits('100000'));

    const newVeLogic = await DeployerUtils.deployContract(gov, 'VeTetu')

    await controller.announceProxyUpgrade([Addresses.getCore().ve], [newVeLogic.address]);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await controller.upgradeProxy([Addresses.getCore().ve]);


    await tetuUsdcBpt.approve(ve.address, Misc.MAX_UINT);
    await tetuUsdcBpt.connect(owner2).approve(ve.address, Misc.MAX_UINT);


    await IControllerV1__factory.connect('0x6678814c273d5088114B6E40cC49C8DB04F9bC29', gov).changeWhiteListStatus([ve.address], true)
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

  it("create lock and withdraw when staking activated", async function () {
    if (Misc.isNotNetwork(137)) return;

    const balanceBefore = await tetuUsdcBpt.balanceOf(owner.address);

    await ve.connect(gov).changeTokenFarmingAllowanceStatus(tetuUsdcBpt.address, true)
    const veId = await ve.callStatic.createLock(tetuUsdcBpt.address, parseUnits('1'), LOCK_PERIOD);
    await ve.createLock(tetuUsdcBpt.address, parseUnits('1'), LOCK_PERIOD);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);

    await ve.withdrawAll(veId)

    const balanceAfter = await tetuUsdcBpt.balanceOf(owner.address);

    expect(balanceAfter).eq(balanceBefore);
  });

  it("deposit exist balance and emergency withdraw after", async function () {
    if (Misc.isNotNetwork(137)) return;

    const balanceBefore = await tetuUsdcBpt.balanceOf(ve.address);

    await ve.stakeAvailableTokens(tetuUsdcBpt.address)
    expect(await tetuUsdcBpt.balanceOf(ve.address)).eq(balanceBefore, "should not stake before whitelisting");

    await ve.connect(gov).changeTokenFarmingAllowanceStatus(tetuUsdcBpt.address, true)

    await ve.stakeAvailableTokens(tetuUsdcBpt.address)

    expect(await tetuUsdcBpt.balanceOf(ve.address)).eq('0', "should stake all after whitelisting");


    await ve.connect(gov).changeTokenFarmingAllowanceStatus(tetuUsdcBpt.address, false)

    await ve.emergencyWithdrawStakedTokens(tetuUsdcBpt.address);

    expect(await tetuUsdcBpt.balanceOf(ve.address)).eq(balanceBefore, "should withdraw all im emergency");
  });

});
