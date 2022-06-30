import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {ControllerV2, InvestFundV2, InvestFundV2__factory, MockToken, ProxyControlled__factory} from "../../typechain";
import {parseUnits} from "ethers/lib/utils";


const {expect} = chai;

describe("invest fund v2 tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;

  let fund: InvestFundV2;
  let tetu: MockToken;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, signer2] = await ethers.getSigners();

    const controller = await DeployerUtils.deployController(signer);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    const fundAdr = await DeployerUtils.deployProxy(signer, 'InvestFundV2');
    fund = InvestFundV2__factory.connect(fundAdr, signer);
    await fund.init(controller.address);
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

  it("withdraw test", async function () {
    const bal = await tetu.balanceOf(signer.address);
    await tetu.transfer(fund.address, parseUnits('1'));
    await fund.withdraw(tetu.address, parseUnits('1'))
    expect(await tetu.balanceOf(signer.address)).eq(bal);
  });

  it("withdraw not gov revert", async function () {
    await expect(fund.connect(signer2).withdraw(tetu.address, parseUnits('1'))).revertedWith('!gov');
  });

  it("deposit test", async function () {
    await tetu.approve(fund.address, parseUnits('1'))
    await fund.deposit(tetu.address, parseUnits('1'))
    expect(await tetu.balanceOf(fund.address)).eq(parseUnits('1'))
  });

});
