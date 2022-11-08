import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {ForwarderV3, MockBribe, MockLiquidator, MockToken, MockVault, MockVoter, PlatformVoter} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";

const {expect} = chai;

describe("forwarder tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;
  let investFund: SignerWithAddress;
  let strategy: SignerWithAddress;

  let forwarder: ForwarderV3;
  let liquidator: MockLiquidator;
  let voter: MockVoter;
  let bribe: MockBribe;
  let vault: MockVault;
  let vault2: MockVault;
  let platformVoter: PlatformVoter;

  let tetu: MockToken;
  let usdc: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, signer2, investFund, strategy] = await ethers.getSigners();

    const controller = await DeployerUtils.deployMockController(signer);

    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);

    bribe = await DeployerUtils.deployContract(signer, 'MockBribe', controller.address) as MockBribe;
    vault = await DeployerUtils.deployMockVault(signer, controller.address, tetu.address, 'test', strategy.address, 0);
    vault2 = await DeployerUtils.deployMockVault(signer, controller.address, usdc.address, 'test2', strategy.address, 0);

    forwarder = await DeployerUtils.deployForwarder(signer, controller.address, tetu.address, bribe.address);

    liquidator = await DeployerUtils.deployContract(signer, 'MockLiquidator') as MockLiquidator;

    const ve = await DeployerUtils.deployVeTetu(signer, tetu.address, controller.address);
    voter = await DeployerUtils.deployMockVoter(signer, ve.address);

    platformVoter = await DeployerUtils.deployPlatformVoter(signer, controller.address, ve.address);

    await controller.setLiquidator(liquidator.address);
    await controller.setVoter(voter.address);
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

    const amount = parseUnits('100000');
    await tetu.approve(forwarder.address, amount);
    await forwarder.registerIncome([tetu.address], [amount], vault.address, true);

    expect(await tetu.balanceOf(voter.address)).eq(parseUnits('27000'));
    expect(await tetu.balanceOf(bribe.address)).eq(parseUnits('63000'));
    expect(await tetu.balanceOf(investFund.address)).eq(parseUnits('10000'));
  });

  it("distribute usdc test", async function () {
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(10_000);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(30_000);

    await tetu.transfer(liquidator.address, parseUnits('100'));

    const amount = parseUnits('100', 6);
    await usdc.approve(forwarder.address, amount);
    await forwarder.registerIncome([usdc.address], [amount], vault.address, true);

    expect(await tetu.balanceOf(voter.address)).eq(parseUnits('27', 6));
    expect(await tetu.balanceOf(bribe.address)).eq(parseUnits('63', 6));
    expect(await tetu.balanceOf(investFund.address)).eq(parseUnits('10', 6));
  });

  it("distribute no route revert", async function () {
    const amount = parseUnits('100', 6);
    await usdc.approve(forwarder.address, amount);
    await forwarder.registerIncome([usdc.address], [amount], vault.address, false);

    await liquidator.setRouteLength(0);
    await liquidator.setError('no_route');
    await expect(forwarder.distribute(usdc.address)).revertedWith('no_route');
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


  it("register income test", async function () {

    await liquidator.setPrice(0);

    const amount = parseUnits('100', 6);
    await usdc.approve(forwarder.address, Misc.MAX_UINT);
    await forwarder.registerIncome([usdc.address], [amount], vault.address, true);

    expect(await forwarder.queuedTokensLength()).eq(1);
    expect(await forwarder.queuedTokenAt(0)).eq(usdc.address);
    expect(await forwarder.tokenPerDestinationLength(vault.address)).eq(1);
    expect(await forwarder.tokenPerDestinationAt(vault.address, 0)).eq(usdc.address);
    expect(await forwarder.destinationsLength(usdc.address)).eq(1);
    expect(await forwarder.destinationAt(usdc.address, 0)).eq(vault.address);
    expect(await forwarder.amountPerDestination(usdc.address, vault.address)).eq(amount);
    expect(await usdc.balanceOf(forwarder.address)).eq(amount);

    await tetu.transfer(liquidator.address, parseUnits('1000000'));
    await liquidator.setPrice(parseUnits('100000'));

    await forwarder.distribute(usdc.address);

    expect(await forwarder.queuedTokensLength()).eq(0);
    expect(await forwarder.tokenPerDestinationLength(vault.address)).eq(0);
    expect(await forwarder.destinationsLength(usdc.address)).eq(0);
    expect(await forwarder.amountPerDestination(usdc.address, bribe.address)).eq(0);
    expect(await usdc.balanceOf(forwarder.address)).eq(0);
  });

  it("register income with zero sum not revert", async function () {
    await forwarder.registerIncome([usdc.address], [0], vault.address, false);
  });

  it("distribute with zero sum not revert", async function () {
    await forwarder.distribute(usdc.address);
  });

  it("distribute to one dst test", async function () {
    await tetu.transfer(liquidator.address, parseUnits('1000000'));
    await liquidator.setPrice(parseUnits('100000'));

    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(30_000);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(30_000);

    await forwarder.setSlippage(usdc.address, 99_000);

    const incomeToken = usdc;
    const targetToken = tetu;
    const pool = vault;
    const amount = parseUnits('100', 6);
    await incomeToken.approve(forwarder.address, Misc.MAX_UINT);
    await forwarder.registerIncome([incomeToken.address], [amount], pool.address, false);

    await forwarder.distribute(incomeToken.address);

    expect(await targetToken.balanceOf(voter.address)).eq(parseUnits('21', 6));
    expect(await targetToken.balanceOf(investFund.address)).eq(parseUnits('30', 6));
    expect(await targetToken.balanceOf(bribe.address)).eq(parseUnits('49', 6));

    await forwarder.registerIncome([incomeToken.address], [amount], pool.address, false);

    await forwarder.distribute(incomeToken.address);

    expect(await targetToken.balanceOf(voter.address)).eq(parseUnits('42', 6));
    expect(await targetToken.balanceOf(investFund.address)).eq(parseUnits('60', 6));
    expect(await targetToken.balanceOf(bribe.address)).eq(parseUnits('98', 6));
  });

  it("distribute to multiple dst test", async function () {
    await tetu.transfer(liquidator.address, parseUnits('1000000'));
    await liquidator.setPrice(parseUnits('100000'));

    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(30_000);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(30_000);

    const incomeToken = usdc;
    const targetToken = tetu;
    const pool = vault;
    await incomeToken.approve(forwarder.address, Misc.MAX_UINT);

    await forwarder.registerIncome([incomeToken.address], [1237], pool.address, false);
    await incomeToken.transfer(forwarder.address, 7317);
    await forwarder.registerIncome([incomeToken.address], [7317], vault2.address, false);

    await forwarder.distributeAll(pool.address);

    expect(await targetToken.balanceOf(forwarder.address)).eq(0);
    expect(await targetToken.balanceOf(voter.address)).eq(1796);
    expect(await targetToken.balanceOf(investFund.address)).eq(2566);
    expect(await targetToken.balanceOf(bribe.address)).eq(4192);
  });

  it("distribute with 100% gauge test", async function () {
    await tetu.transfer(liquidator.address, parseUnits('1000000'));
    await liquidator.setPrice(parseUnits('100000'));

    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(0);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(100_000);

    await usdc.approve(forwarder.address, Misc.MAX_UINT);
    await forwarder.registerIncome([usdc.address], [1237], vault.address, true);
  });

  it("distribute with 100% invest fund test", async function () {
    await tetu.transfer(liquidator.address, parseUnits('1000000'));
    await liquidator.setPrice(parseUnits('100000'));

    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(100_000);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(0);

    await usdc.approve(forwarder.address, Misc.MAX_UINT);
    await forwarder.registerIncome([usdc.address], [1237], vault.address, true);
  });

  it("distribute with 100% bribe test", async function () {
    await tetu.transfer(liquidator.address, parseUnits('1000'));
    await liquidator.setPrice(parseUnits('100000'));

    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(0);
    await forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(0);

    await usdc.approve(forwarder.address, Misc.MAX_UINT);
    await forwarder.registerIncome([usdc.address], [1237], vault.address, true);
  });

  it("set invest fund ratio too high revert", async function () {
    await expect(forwarder.connect(await Misc.impersonate(platformVoter.address)).setInvestFundRatio(1000_000)).revertedWith('TOO_HIGH');
  });

  it("set gauge ratio too high revert", async function () {
    await expect(forwarder.connect(await Misc.impersonate(platformVoter.address)).setGaugesRatio(1000_000)).revertedWith('TOO_HIGH');
  });

  it("set invest fund ratio from not owner revert", async function () {
    await expect(forwarder.setInvestFundRatio(1)).revertedWith('DENIED');
  });

  it("set gauge ratio from not owner revert", async function () {
    await expect(forwarder.setGaugesRatio(1)).revertedWith('DENIED');
  });

});
