import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {
  ForwarderV3, MockLiquidator,
  MockStakingToken,
  MockToken, MockVoter, MultiBribe,
  MultiGauge,
  MultiGauge__factory, PlatformVoter, TetuVoter, VeDistributor,
  VeTetu
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";


const {expect} = chai;

const FULL_AMOUNT = parseUnits('100');
const LOCK_PERIOD = 60 * 60 * 24 * 365;

describe("forwarder tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;
  let investFund: SignerWithAddress;

  let forwarder: ForwarderV3;
  let liquidator: MockLiquidator;
  let veDist: VeDistributor;
  let voter: MockVoter;
  let platformVoter: PlatformVoter;

  let tetu: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, signer2, investFund] = await ethers.getSigners();

    const controller = await DeployerUtils.deployMockController(signer);

    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');

    forwarder = await DeployerUtils.deployForwarder(signer, controller.address, tetu.address);

    liquidator = await DeployerUtils.deployContract(signer, 'MockLiquidator') as MockLiquidator;

    const ve = await DeployerUtils.deployVeTetu(signer, tetu.address, controller.address);
    veDist = await DeployerUtils.deployVeDistributor(signer, controller.address, ve.address, tetu.address);
    voter = await DeployerUtils.deployMockVoter(signer, ve.address);

    platformVoter = await DeployerUtils.deployPlatformVoter(signer, controller.address, ve.address);

    await controller.setLiquidator(liquidator.address);
    await controller.setVoter(voter.address);
    await controller.setVeDistributor(veDist.address);
    await controller.setInvestFund(investFund.address);
    await controller.setPlatformVoter(platformVoter.address);
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

  it("distribute tetu test", async function () {
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(10_000);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(30_000);

    await tetu.transfer(forwarder.address, parseUnits('100000'));
    await forwarder.distribute(tetu.address);
    expect(await tetu.balanceOf(voter.address)).eq(parseUnits('27000'));
    expect(await tetu.balanceOf(veDist.address)).eq(parseUnits('63000'));
    expect(await tetu.balanceOf(investFund.address)).eq(parseUnits('10000'));
  });

  it("distribute no route revert", async function () {
    await liquidator.setRouteLength(0);
    await liquidator.setError('no_route');
    await expect(forwarder.distribute(tetu.address)).revertedWith('no_route');
  });

  it("distribute threshold test", async function () {
    await tetu.transfer(forwarder.address, parseUnits('1'));
    await liquidator.setPrice(1);
    await forwarder.distribute(tetu.address);
  });

  it("distribute tetu with specific slippage test", async function () {
    await tetu.transfer(forwarder.address, parseUnits('100000'));
    await forwarder.setSlippage(tetu.address, 10_000);
    await forwarder.distribute(tetu.address);
  });

  it("distribute tetu for zero to gauges test", async function () {
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(10_000);
    await tetu.transfer(forwarder.address, parseUnits('100000'));
    await forwarder.distribute(tetu.address);
  });

  it("distribute tetu with 0% ve test", async function () {
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(0);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(100_000);
    await tetu.transfer(forwarder.address, parseUnits('100000'));
    await forwarder.distribute(tetu.address);
  });

  it("set if ratio too high revert", async function () {
    await expect(forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(1000_000)).revertedWith('TOO_HIGH');
  });

  it("set gauge ratio too high revert", async function () {
    await expect(forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(1000_000)).revertedWith('TOO_HIGH');
  });

  it("set slippage from not gov revert", async function () {
    await expect(forwarder.connect(signer2).setSlippage(tetu.address, 1000_000)).revertedWith('DENIED');
  });

  it("set threshold from not gov revert", async function () {
    await expect(forwarder.connect(signer2).setTetuThreshold(1000_000)).revertedWith('DENIED');
  });

  it("set slippage too high revert", async function () {
    await expect(forwarder.setSlippage(tetu.address, 1000_000)).revertedWith('TOO_HIGH');
  });

  it("set gauge ratio from not voter revert", async function () {
    await expect(forwarder.setGaugesRatio(1000_000)).revertedWith('DENIED');
  });

  it("set fund ratio from not voter revert", async function () {
    await expect(forwarder.setInvestFundRatio(1000_000)).revertedWith('DENIED');
  });

  it("set threshold test", async function () {
    await forwarder.setTetuThreshold(1);
    expect(await forwarder.tetuThreshold()).eq(1);
  });


  it("set slippage test", async function () {
    await forwarder.setSlippage(tetu.address, 1);
    expect(await forwarder.tokenSlippage(tetu.address)).eq(1);
  });

});
