import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal, MockGauge, MockGauge__factory,
  MockStrategy,
  MockStrategy__factory,
  MockToken,
  TetuVaultV2
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {parseUnits} from "ethers/lib/utils";
import {BigNumber} from "ethers";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tests for StrategyBaseV2._checkWithdrawImpact", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let controller: ControllerMinimal;
  let usdc: MockToken;
  let wbtc: MockToken;
  let tetu: MockToken;
  let vault: TetuVaultV2;
  let mockGauge: MockGauge;

//region begin, after
  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    wbtc = await DeployerUtils.deployMockToken(signer, 'DAI', 8);
    await usdc.transfer(signer2.address, parseUnits('1', 6));
    await wbtc.transfer(signer2.address, parseUnits('1', 8));

    mockGauge = MockGauge__factory.connect(await DeployerUtils.deployProxy(signer, 'MockGauge'), signer);
    await mockGauge.init(controller.address);

    const forwarder = await DeployerUtils.deployContract(signer, 'MockForwarder')
    await controller.setForwarder(forwarder.address);
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
//endregion begin, after

//region Utils
  async function makeCheckWithdrawImpactTest(
    asset: MockToken,
    balanceBeforeWithdraw: BigNumber,
    balanceAfterWithdraw: BigNumber,
    investedAssetsUSD: BigNumber,
    assetPrice: BigNumber
  ) : Promise<BigNumber> {
    // initialize the vault and the strategy
    vault = await DeployerUtils.deployTetuVaultV2(
      signer,
      controller.address,
      asset.address,
      await asset.name(),
      await asset.name(),
      mockGauge.address,
      0
    );

    const splitter = await DeployerUtils.deploySplitter(signer, controller.address, asset.address, vault.address);
    await vault.setSplitter(splitter.address)

    await asset.connect(signer2).approve(vault.address, Misc.MAX_UINT);
    await asset.connect(signer1).approve(vault.address, Misc.MAX_UINT);
    await asset.approve(vault.address, Misc.MAX_UINT);

    const strategy = MockStrategy__factory.connect((await DeployerUtils.deployProxy(signer, 'MockStrategy')), signer);

    // prepare the strategy
    await strategy.init(controller.address, splitter.address);

    // set strategy balance to expected value
    await asset.transfer(strategy.address, balanceAfterWithdraw);

    // test _checkWithdrawImpact
    return strategy.callStatic.checkWithdrawImpactAccessForTests(
      asset.address,
      balanceBeforeWithdraw,
      investedAssetsUSD,
      assetPrice
    );
  }
//endregion Utils

//region Unit tests
  describe("Difference is zero", () => {
    it("USDC, decimals 6", async () => {
      const retBalance = await makeCheckWithdrawImpactTest(
        usdc,
        parseUnits("50", 6),
        parseUnits("99", 6),
        parseUnits("245", 6), // (99 - 50) * 5
        parseUnits("5", 18)
      );
      expect(retBalance.eq(parseUnits("99", 6))).eq(true);
    });
    it("WBTC, decimals 8", async () => {
      const retBalance = await makeCheckWithdrawImpactTest(
        usdc,
        parseUnits("50", 8),
        parseUnits("99", 8),
        parseUnits("245", 8), // (99 - 50) * 5
        parseUnits("5", 18)
      );
      expect(retBalance.eq(parseUnits("99", 8))).eq(true);
    });
  });

  describe("Difference is less than price impact", () => {
    it("USDC, decimals 6", async () => {
      const retBalance = await makeCheckWithdrawImpactTest(
        usdc,
        parseUnits("50", 6),
        parseUnits("99", 6),
        parseUnits("247", 6), // (99 - 50) * 5 + delta
        parseUnits("5", 18)
      );
      expect(retBalance.eq(parseUnits("99", 6))).eq(true);
    });
    it("WBTC, decimals 8", async () => {
      const retBalance = await makeCheckWithdrawImpactTest(
        usdc,
        parseUnits("50", 8),
        parseUnits("99", 8),
        parseUnits("247", 8), // (99 - 50) * 5 + delta
        parseUnits("5", 18)
      );
      expect(retBalance.eq(parseUnits("99", 8))).eq(true);
    });
  });

  describe("Difference is greater than price impact", () => {
    it("USDC, decimals 6", async () => {
      await expect(
        makeCheckWithdrawImpactTest(
          usdc,
          parseUnits("50", 6),
          parseUnits("90", 6),
          parseUnits("247", 6), // (99 - 50) * 5 + delta
          parseUnits("5", 18)
        )
      ).revertedWith("SB: Too high");
    });
    it("WBTC, decimals 8", async () => {
      await expect(
        makeCheckWithdrawImpactTest(
          usdc,
          parseUnits("50", 8),
          parseUnits("90", 8),
          parseUnits("247", 8), // (99 - 50) * 5 + delta
          parseUnits("5", 18)
        )
      ).revertedWith("SB: Too high");
    });
  });

  describe("Both investedAssetsUSD and price are zero", () => {
    it("WBTC, decimals 8", async () => {
      const retBalance = await makeCheckWithdrawImpactTest(
          usdc,
          parseUnits("50", 8),
          parseUnits("99", 8),
          parseUnits("0", 8), // (!) investedAssetsUSD is zero
          parseUnits("0", 18), // (!) price is zero
      );
      expect(retBalance.eq(parseUnits("99", 8))).eq(true);
    });
  });
//endregion Unit tests
});
