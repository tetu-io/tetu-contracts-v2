import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal,
  MockGauge,
  MockGauge__factory,
  MockSplitter,
  MockSplitter__factory,
  MockToken,
  ProxyControlled,
  TetuVaultV2,
  TetuVaultV2__factory,
} from "../../typechain";
import {Misc} from "../../scripts/utils/Misc";
import {formatUnits, parseUnits} from "ethers/lib/utils";


const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu Vault V2 tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let controller: ControllerMinimal;
  let usdc: MockToken;
  let tetu: MockToken;
  let vault: TetuVaultV2;
  let mockSplitter: MockSplitter;
  let mockGauge: MockGauge;

  before(async function () {
    [signer, signer1, signer2] = await ethers.getSigners()
    snapshotBefore = await TimeUtils.snapshot();

    controller = await DeployerUtils.deployMockController(signer);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6);
    tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
    await usdc.transfer(signer2.address, parseUnits('1', 6));

    mockGauge = MockGauge__factory.connect(await DeployerUtils.deployProxy(signer, 'MockGauge'), signer);
    await mockGauge.init(controller.address)
    vault = await DeployerUtils.deployTetuVaultV2(
      signer,
      controller.address,
      usdc.address,
      'USDC',
      'USDC',
      mockGauge.address,
      10
    );

    mockSplitter = MockSplitter__factory.connect(await DeployerUtils.deployProxy(signer, 'MockSplitter'), signer);
    await mockSplitter.init(controller.address, usdc.address, vault.address);
    await vault.setSplitter(mockSplitter.address)

    await usdc.connect(signer2).approve(vault.address, Misc.MAX_UINT);
    await usdc.connect(signer1).approve(vault.address, Misc.MAX_UINT);
    await usdc.approve(vault.address, Misc.MAX_UINT);

    await vault.setWithdrawRequestBlocks(0);
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

  describe("withdrawRequestBlocks ==   0", () => {
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
      expect(await vault.balanceOf(signer1.address)).eq(999000); // 1000 initial shares goes to dead address
      expect(bal1.sub(await usdc.balanceOf(signer.address))).eq(parseUnits('1', 6));

      const bal2 = await usdc.balanceOf(signer.address);
      await vault.deposit(parseUnits('1', 6), signer.address);
      expect(await vault.balanceOf(signer.address)).eq(1000000); // NO DEPOSIT FEES
      expect(bal2.sub(await usdc.balanceOf(signer.address))).eq(parseUnits('1', 6));

      expect(await vault.sharePrice()).eq(parseUnits('1', 6))
    });

    it("mint test", async () => {
      const bal1 = await usdc.balanceOf(signer.address);
      await vault.mint(990_000, signer1.address);
      expect(await vault.balanceOf(signer1.address)).eq(989_000);
      expect(bal1.sub(await usdc.balanceOf(signer.address))).eq(990_000);

      const bal2 = await usdc.balanceOf(signer.address);
      await vault.mint(990_000, signer.address);
      expect(await vault.balanceOf(signer.address)).eq(990_000);
      expect(bal2.sub(await usdc.balanceOf(signer.address))).eq(990_000);

      expect(await vault.sharePrice()).eq(parseUnits('1', 6))
    });

    it("withdraw test", async () => {
      await vault.deposit(parseUnits('1', 6), signer1.address);
      await vault.deposit(parseUnits('1', 6), signer.address);

      const shares = await vault.balanceOf(signer.address);
      expect(shares).eq(1_000_000);

      const assets = await vault.convertToAssets(shares);
      const assetsMinusTax = assets.mul(100).div(100);
      expect(assetsMinusTax).eq(1_000_000);

      const bal1 = await usdc.balanceOf(signer.address);
      const shares1 = await vault.balanceOf(signer.address);
      await vault.withdraw(assetsMinusTax, signer.address, signer.address);
      expect(shares1.sub(await vault.balanceOf(signer.address))).eq(shares);
      expect((await usdc.balanceOf(signer.address)).sub(bal1)).eq(assetsMinusTax);

      expect(await vault.sharePrice()).eq(parseUnits('1', 6))
    });

    it("redeem test", async () => {
      await vault.deposit(parseUnits('1', 6), signer1.address);
      await vault.deposit(parseUnits('1', 6), signer.address);

      const shares = await vault.balanceOf(signer.address);
      expect(shares).eq(1_000_000);

      const assets = await vault.convertToAssets(shares);
      const assetsMinusTax = assets.mul(100).div(100);
      expect(assetsMinusTax).eq(1_000_000);

      const bal1 = await usdc.balanceOf(signer.address);
      const shares1 = await vault.balanceOf(signer.address);
      await vault.redeem(shares, signer.address, signer.address);
      expect(shares1.sub(await vault.balanceOf(signer.address))).eq(shares);
      expect((await usdc.balanceOf(signer.address)).sub(bal1)).eq(assetsMinusTax);

      expect(await vault.sharePrice()).eq(parseUnits('1', 6))
    });

    it("init wrong buffer revert", async () => {
      const logic = await DeployerUtils.deployContract(signer, 'TetuVaultV2') as TetuVaultV2;
      const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
      await proxy.initProxy(logic.address);
      const v = TetuVaultV2__factory.connect(proxy.address, signer);
      await expect(v.init(
        controller.address,
        usdc.address,
        '1',
        '2',
        mockGauge.address,
        10000000,
      )).revertedWith("!BUFFER");
    });

    it("init wrong gauge revert", async () => {
      const logic = await DeployerUtils.deployContract(signer, 'TetuVaultV2') as TetuVaultV2;
      const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
      await proxy.initProxy(logic.address);
      const v = TetuVaultV2__factory.connect(proxy.address, signer);
      await expect(v.init(
        controller.address,
        usdc.address,
        '1',
        '2',
        Misc.ZERO_ADDRESS,
        10,
      )).revertedWith("!GAUGE");
    });

    it("init wrong gauge controller revert", async () => {
      const logic = await DeployerUtils.deployContract(signer, 'TetuVaultV2') as TetuVaultV2;
      const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
      await proxy.initProxy(logic.address);
      const v = TetuVaultV2__factory.connect(proxy.address, signer);
      const c = await DeployerUtils.deployMockController(signer);
      const g = MockGauge__factory.connect(await DeployerUtils.deployProxy(signer, 'MockGauge'), signer);
      await g.init(c.address)
      await expect(v.init(
        controller.address,
        usdc.address,
        '1',
        '2',
        g.address,
        10,
      )).revertedWith("!GAUGE_CONTROLLER");
    });

    it("set too high buffer revert", async () => {
      await expect(vault.setBuffer(1000_000)).revertedWith("BUFFER");
    });

    it("set buffer from 3d party revert", async () => {
      await expect(vault.connect(signer2).setBuffer(10)).revertedWith("DENIED");
    });

    it("set buffer test", async () => {
      await vault.setBuffer(1_000);
      await vault.deposit(parseUnits('1', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(10_000);
      await vault.deposit(100, signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(10001);
    });

    it("set max withdraw from 3d party revert", async () => {
      await expect(vault.connect(signer2).setMaxWithdraw(1, 1)).revertedWith("DENIED");
    });

    it("set max deposit from 3d party revert", async () => {
      await expect(vault.connect(signer2).setMaxDeposit(1, 1)).revertedWith("DENIED");
    });

    it("set max deposit test", async () => {
      await vault.setMaxDeposit(10, 10);
      await expect(vault.deposit(11, signer.address)).revertedWith("MAX");
      await expect(vault.mint(11, signer.address)).revertedWith("MAX");
    });

    it("set buffer test", async () => {
      await vault.setMaxWithdraw(10, 10);
      await vault.deposit(parseUnits('1', 6), signer.address)
      await expect(vault.withdraw(11, signer.address, signer.address)).revertedWith("MAX");
      await expect(vault.redeem(11, signer.address, signer.address)).revertedWith("MAX");
      await vault.withdraw(10, signer.address, signer.address)
      await vault.redeem(10, signer.address, signer.address)
    });

    it("set DoHardWorkOnInvest from 3d party revert", async () => {
      await expect(vault.connect(signer2).setDoHardWorkOnInvest(false)).revertedWith("DENIED");
    });

    /*it("insurance transfer revert", async () => {
      const insurance = VaultInsurance__factory.connect(await vault.insurance(), signer);
      await expect(insurance.init(Misc.ZERO_ADDRESS, Misc.ZERO_ADDRESS)).revertedWith("INITED");
    });*/

    /*it("insurance transfer revert", async () => {
      const insurance = VaultInsurance__factory.connect(await vault.insurance(), signer);
      await expect(insurance.transferToVault(1)).revertedWith("!VAULT");
    });*/

    it("set DoHardWorkOnInvest test", async () => {
      await vault.setDoHardWorkOnInvest(false);
      expect(await vault.doHardWorkOnInvest()).eq(false);
      await vault.deposit(parseUnits('1', 6), signer.address)
    });

    it("check buffer complex test", async () => {
      await vault.setBuffer(100_000);
      await vault.deposit(parseUnits('1', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(1_000_000);
      await vault.setBuffer(10_000);
      await vault.deposit(parseUnits('1', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(200_000);
      await vault.setBuffer(100_000);
      await vault.deposit(parseUnits('1', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(1200_000);
      await vault.withdraw(parseUnits('1', 6), signer.address, signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(200_000);
      await vault.withdraw(parseUnits('2', 6).sub(1000), signer.address, signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(1000);
    });

    it("not invest on deposit", async () => {
      await vault.setBuffer(10_000);
      await vault.deposit(parseUnits('1', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(100_000);
      await vault.setBuffer(20_000);
      await vault.deposit(parseUnits('0.01', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(110_000);
    });

    it("withdraw when splitter have not enough balance", async () => {
      await vault.setBuffer(10_000);
      const bal = await usdc.balanceOf(signer.address);
      await vault.deposit(parseUnits('1', 6), signer.address)
      expect(await usdc.balanceOf(vault.address)).eq(100_000);
      await mockSplitter.connect(signer2).lost(parseUnits('0.1', 6))
      await vault.withdrawAll()
      expect(await usdc.balanceOf(vault.address)).eq(90);
      const balAfter = await usdc.balanceOf(signer.address);
      expect(bal.sub(balAfter)).eq(parseUnits('0.1', 6).add(900));
    });

    it("withdraw with slippage should be OK for all users. Each user pay for himself.", async () => {
      await vault.setBuffer(0);
      const bal1 = await usdc.balanceOf(signer2.address);
      await vault.deposit(parseUnits('1', 6), signer.address)
      await vault.connect(signer2).deposit(parseUnits('1', 6), signer2.address)

      await mockSplitter.setSlippage(10_0);
      await expect(vault.withdrawAll()).revertedWith('SLIPPAGE');

      await mockSplitter.setSlippage(1_0);
      await expect(vault.withdrawAll()).revertedWith('SLIPPAGE');

      await mockSplitter.setSlippage(0); // 0.4%
      // console.log('signer withdraw start');
      const balBefore = await usdc.balanceOf(signer.address);
      await vault.withdrawAll();
      // console.log('signer withdraw done');

      const balAfter = await usdc.balanceOf(signer.address);
      // console.log('balBefore withdrawAll', balBefore)
      // console.log('balAfter  withdrawAll', balAfter)
      // console.log('withdrawn withdrawAll', formatUnits(balAfter.sub(balBefore), 6))
      expect(balAfter.sub(balBefore)).eq(parseUnits('1', 6).sub(1000)); // substract INITIAL 1000 shares cost

      await mockSplitter.setSlippage(1);
      // console.log('signer2 withdraw start');
      await vault.connect(signer2).withdrawAll()
      // console.log('signer2 withdraw done');
      const balAfter1 = await usdc.balanceOf(signer2.address);
      expect(bal1.sub(balAfter1)).eq(parseUnits('0.001', 6));
    });

    it("splitter assets test", async () => {
      expect(await vault.splitterAssets()).eq(0);
    });

    it("maxWithdraw test (withdrawAll)", async () => {
      await vault.deposit(parseUnits('1', 6), signer.address)
      const balanceBefore = await usdc.balanceOf(signer.address);
      const expectWithdraw = parseUnits('1', 6).sub(parseUnits('0.001', 6));
      expect(await vault.maxWithdraw(signer.address)).eq(expectWithdraw);
      await vault.withdrawAll();
      const balanceAfter = await usdc.balanceOf(signer.address);
      expect(balanceBefore.add(expectWithdraw)).eq(balanceAfter);
    });

    it("maxWithdraw test (withdraw max)", async () => {
      await vault.deposit(parseUnits('1', 6), signer.address)
      const balanceBefore = await usdc.balanceOf(signer.address);
      const expectWithdraw = parseUnits('1', 6).sub(parseUnits('0.001', 6));
      expect(await vault.maxWithdraw(signer.address)).eq(expectWithdraw);
      await vault.withdraw(await vault.maxWithdraw(signer.address), signer.address, signer.address);
      const balanceAfter = await usdc.balanceOf(signer.address);
      expect(balanceBefore.add(expectWithdraw)).eq(balanceAfter);
    });

    it("maxWithdraw complex test (withdraw max)", async () => {
      await vault.deposit(parseUnits('99800.001', 6), signer.address)
      await vault.deposit(parseUnits('10300.001656', 6), signer2.address)
      await usdc.transfer(vault.address, parseUnits('0.000267', 6));
      expect(await vault.previewWithdraw(await vault.maxWithdraw(signer.address))).eq(await vault.balanceOf(signer.address));
      await vault.withdraw(await vault.maxWithdraw(signer.address), signer.address, signer.address);
    });

    it("cover loss test", async () => {
      const bal = await usdc.balanceOf(signer.address);
      await vault.deposit(parseUnits('1', 6), signer.address);
      await vault.withdrawAll();
      const balAfter = await usdc.balanceOf(signer.address);
      expect(bal.sub(balAfter)).eq(1000);
    });

    describe("splitter setup tests", function () {
      let v: TetuVaultV2;
      before(async function () {
        const logic = await DeployerUtils.deployContract(signer, 'TetuVaultV2') as TetuVaultV2;
        const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
        await proxy.initProxy(logic.address);
        v = TetuVaultV2__factory.connect(proxy.address, signer);
        await v.init(
          controller.address,
          usdc.address,
          '1',
          '2',
          mockGauge.address,
          10,
        )
      });

      it("set splitter from 3d party revert", async () => {
        await expect(vault.connect(signer2).setSplitter(Misc.ZERO_ADDRESS)).revertedWith("DENIED");
      });

      it("wrong asset revert", async () => {
        const s = MockSplitter__factory.connect(await DeployerUtils.deployProxy(signer, 'MockSplitter'), signer);
        await s.init(controller.address, tetu.address, vault.address);
        await expect(v.setSplitter(s.address)).revertedWith("WRONG_UNDERLYING");
      });

      it("wrong vault revert", async () => {
        const s = MockSplitter__factory.connect(await DeployerUtils.deployProxy(signer, 'MockSplitter'), signer);
        await s.init(controller.address, usdc.address, vault.address);
        await expect(v.setSplitter(s.address)).revertedWith("WRONG_VAULT");
      });

      it("wrong controller revert", async () => {
        const cc = await DeployerUtils.deployMockController(signer);
        const s = MockSplitter__factory.connect(await DeployerUtils.deployProxy(signer, 'MockSplitter'), signer);
        await s.init(cc.address, usdc.address, v.address);
        await expect(v.setSplitter(s.address)).revertedWith("WRONG_CONTROLLER");
      });

      it("set withdrawRequestBlocks", async () => {
        await expect(vault.connect(signer2).setWithdrawRequestBlocks(10)).revertedWith("DENIED");
        await vault.setWithdrawRequestBlocks(10);
        expect(await vault.withdrawRequestBlocks()).eq(10);
      });

      it("withdraw request not asked revert", async () => {
        await vault.setWithdrawRequestBlocks(10);
        await vault.deposit(10000, signer.address);
        await expect(vault.withdrawAll()).revertedWith("NOT_REQUESTED");
      });
    });
  });

  describe("withdrawRequestBlocks != 0", () => {
    describe("withdraw and withdrawAll", () => {
      interface IWithdrawRequestsTestParams {
        withdrawRequestBlocks?: number;
        makeWithdrawRequestsJustBeforeWithdraw?: boolean;
        countBlocks?: number;
        deposits: {
          amountToDeposit: string;
          depositor?: string;
          receiver?: string;
          countBlocks?: number;
        }[];
        withdraws?: {
          amountToWithdraw: string;
          withdrawReceiver?: string;
          withdrawCaller?: string;
          withdrawOwner?: string;
          countBlocks?: number;
        }[];
        actionsBefore?: {
          countBlocks?: number;
          requestWithdrawCallers?: string[];
        }
      }

      interface IWithdrawRequestsTestResults {
        receivedAmount: number;
      }

      async function withdrawRequestsTest(p: IWithdrawRequestsTestParams): Promise<IWithdrawRequestsTestResults> {
        // set up vault
        await vault.setWithdrawRequestBlocks(p.withdrawRequestBlocks || 5);
        await vault.setBuffer(0); // for simplicity of cal

        // exclude INITIAL_SHARES influences
        await vault.connect(signer2).deposit(parseUnits("1", 6), signer2.address);

        // make actions before (to try to hack)
        if (p.actionsBefore) {
          if (p.actionsBefore.requestWithdrawCallers) {
            for (const caller of p.actionsBefore.requestWithdrawCallers) {
              await vault.connect(await Misc.impersonate(caller)).requestWithdraw();
            }
          }
          // console.log("advance blocks 1", p.actionsBefore.countBlocks ?? 5);
          await TimeUtils.advanceNBlocks(p.actionsBefore.countBlocks ?? 5);
        }

        // Signer deposits to vault
        for (const d of p.deposits) {
          const receiver = d.receiver || signer.address;
          const depositor = await Misc.impersonate(d.depositor || signer.address);
          const amountToDeposit = parseUnits(d.amountToDeposit, 6);
          if (depositor.address !== signer.address) {
            await usdc.mint(depositor.address, amountToDeposit);
            await usdc.connect(depositor).approve(vault.address, amountToDeposit);
          }
          await vault.connect(depositor).deposit(amountToDeposit, receiver);
          if (d.countBlocks) {
            // console.log("advance blocks 4", d.countBlocks);
            await TimeUtils.advanceNBlocks(d.countBlocks);
          }
        }

        // advance blocks
        // console.log("advance blocks 2", p.countBlocks ?? 5);
        await TimeUtils.advanceNBlocks(p.countBlocks ?? 5);

        // Signer withdraws from vault

        if (p.makeWithdrawRequestsJustBeforeWithdraw) {
          await vault.requestWithdraw();
        }

        // withdraw or withdrawAll; withdraw allows to use not equal owner and receiver
        let receivedAmount = 0;
        if (p.withdraws) {
          for (const w of p.withdraws) {
            const receiver = w.withdrawReceiver || signer.address;
            const caller = w.withdrawCaller || signer.address;
            const owner = w.withdrawOwner || signer.address;

            const amount = w.amountToWithdraw === "MAX"
              ? await vault.maxWithdraw(owner)
              : parseUnits(w.amountToWithdraw, 6);
            // console.log("Amount to withdraw", amount);
            if (owner !== caller) {
              await vault.connect(await Misc.impersonate(owner)).approve(caller, amount);
            }

            const balanceBefore = await usdc.balanceOf(receiver);
            await vault.connect(await Misc.impersonate(caller)).withdraw(amount, receiver, owner);
            const balanceAfter = await usdc.balanceOf(receiver);
            receivedAmount += +formatUnits(balanceAfter.sub(balanceBefore), 6);

            if (w.countBlocks) {
              // console.log("advance blocks 3", w.countBlocks);
              await TimeUtils.advanceNBlocks(w.countBlocks);
            }
          }
        } else {
          const balanceBefore = await usdc.balanceOf(signer.address);
          await vault.withdrawAll();
          const balanceAfter = await usdc.balanceOf(signer.address);

          receivedAmount = +formatUnits(balanceAfter.sub(balanceBefore), 6);
        }

        return {receivedAmount}
      }

      describe("withdrawAll", () => {
        it("should return expected amount, countBlocks == withdrawRequestBlocks", async () => {
          const {receivedAmount} = await withdrawRequestsTest({
            deposits: [{amountToDeposit: "1"}],
            withdrawRequestBlocks: 5,
            countBlocks: 6 // (!) > withdrawRequestBlocks
          });
          expect(receivedAmount).eq(1);
        });
        it("should return expected amount, countBlocks > withdrawRequestBlocks", async () => {
          const {receivedAmount} = await withdrawRequestsTest({
            deposits: [{amountToDeposit: "1"}],
            withdrawRequestBlocks: 5,
            countBlocks: 5
          });
          expect(receivedAmount).eq(1);
        });
        it("should revert if requestWithdraw() is called just before withdraw", async () => {
          await expect(withdrawRequestsTest({
              deposits: [{amountToDeposit: "1"}],
              makeWithdrawRequestsJustBeforeWithdraw: true
            })
          ).revertedWith("NOT_REQUESTED");
        });
        it("should revert if withdraw is called too early", async () => {
          await expect(withdrawRequestsTest({
            deposits: [{amountToDeposit: "1"}],
            withdrawRequestBlocks: 5,
            countBlocks: 4 // (!) too early
          })).revertedWith("NOT_REQUESTED");
        });
      });
      describe("withdraw max amount, receiver == owner", () => {
        it("should return expected amount, single withdraw, countBlocks == withdrawRequestBlocks", async () => {
          const {receivedAmount} = await withdrawRequestsTest({
            deposits: [{amountToDeposit: "10"}],
            withdrawRequestBlocks: 5,
            countBlocks: 6, // (!) > withdrawRequestBlocks
            withdraws: [{amountToWithdraw: "MAX"}]
          });
          expect(receivedAmount).eq(10);
        });
        it("should return expected amount, two withdraws, countBlocks == withdrawRequestBlocks", async () => {
          const {receivedAmount} = await withdrawRequestsTest({
            deposits: [{amountToDeposit: "10"}],
            withdrawRequestBlocks: 5,
            countBlocks: 6, // (!) > withdrawRequestBlocks
            withdraws: [{amountToWithdraw: "5", countBlocks: 5}, {amountToWithdraw: "MAX"}]
          });
          expect(receivedAmount).eq(10);
        });
        it("should return expected amount, countBlocks > withdrawRequestBlocks", async () => {
          const {receivedAmount} = await withdrawRequestsTest({
            deposits: [{amountToDeposit: "10"}],
            withdrawRequestBlocks: 5,
            countBlocks: 6, // (!) > withdrawRequestBlocks
            withdraws: [{amountToWithdraw: "MAX"}]
          });
          expect(receivedAmount).eq(10);
        });
        it("should revert if requestWithdraw() is called just before withdraw", async () => {
          await expect(withdrawRequestsTest({
            deposits: [{amountToDeposit: "10"}],
            makeWithdrawRequestsJustBeforeWithdraw: true,
            withdraws: [{amountToWithdraw: "10"}]
          })).revertedWith("NOT_REQUESTED");
        });
        it("should revert if withdraw is called too early", async () => {
          await expect(withdrawRequestsTest({
            deposits: [{amountToDeposit: "1"}],
            withdrawRequestBlocks: 5,
            countBlocks: 4, // (!) too early
            withdraws: [{amountToWithdraw: "MAX"}]
          })).revertedWith("NOT_REQUESTED");
        });
        it("should revert if second withdraw is called too early", async () => {
          await expect(withdrawRequestsTest({
            deposits: [{amountToDeposit: "10"}],
            withdrawRequestBlocks: 5,
            countBlocks: 15,
            withdraws: [
              {amountToWithdraw: "5", countBlocks: 1}, // (!) too early
              {amountToWithdraw: "MAX",},
            ]
          })).revertedWith("NOT_REQUESTED");
        });
      });
      describe("withdraw max amount, signer != receiver != owner", () => {
        const SECOND_ACCOUNT = ethers.Wallet.createRandom().address;
        const THIRD_ACCOUNT = ethers.Wallet.createRandom().address;

        /**
         *  Deposit: A => S (depositor => receiver)
         *  Withdraw: A => S => B (signer => owner => receiver)
         */
        it("should withdraw successfully", async () => {
          const {receivedAmount} = await withdrawRequestsTest({
            deposits: [
              {amountToDeposit: "10", depositor: SECOND_ACCOUNT},
            ],
            withdrawRequestBlocks: 5,
            countBlocks: 5,
            withdraws: [{
              amountToWithdraw: "MAX",
              withdrawCaller: SECOND_ACCOUNT,
              withdrawReceiver: THIRD_ACCOUNT
            }],
          });
          expect(receivedAmount).eq(10);
        });
      });
      describe("Try to hack", () => {
        describe("Withdraw signer != withdraw receiver", () => {
          const RECEIVER_ADDRESS = ethers.Wallet.createRandom().address;

          /**
           * User U1 tries to withdraw without making pause after deposit.
           *
           * U1 withdraws to receiver R1.
           * R1 calls requestWithdraw() 5 blocks before U1 depositing
           *
           *  Deposit: S => S (depositor => receiver)
           *  Withdraw: S => S => R* (signer => owner => receiver)
           *
           *  R* is prepared (requestWithdraw is called 5 blocks before depositing)
           */
          it("should return expected amount, single withdraw, countBlocks == withdrawRequestBlocks", async () => {
            await expect(withdrawRequestsTest({
              deposits: [{amountToDeposit: "10"}],
              withdrawRequestBlocks: 5,
              countBlocks: 0, // (!)
              withdraws: [{amountToWithdraw: "MAX", withdrawReceiver: RECEIVER_ADDRESS}],
              actionsBefore: {
                requestWithdrawCallers: [RECEIVER_ADDRESS],
                countBlocks: 5
              }
            })).revertedWith("NOT_REQUESTED");
          });
        });

        describe("Withdraw signer != withdraw owner", () => {
          const SECOND_ACCOUNT = ethers.Wallet.createRandom().address;

          /**
           * User U1 tries to withdraw without making pause after deposit.
           *
           * U1 withdraws amount of O1 to receiver O1
           * O1 calls requestWithdraw() 5 blocks before U1 depositing
           *
           *  Deposit: A => S (depositor => receiver)
           *  Withdraw: A => S => A* (signer => owner => receiver)
           *
           *  A* is prepared (requestWithdraw is called 5 blocks before depositing)
           */
          it("should return expected amount, single withdraw, countBlocks == withdrawRequestBlocks", async () => {
            await expect(withdrawRequestsTest({
              deposits: [{
                amountToDeposit: "10",
                depositor: SECOND_ACCOUNT
              }],
              withdrawRequestBlocks: 5,
              countBlocks: 0, // (!)
              withdraws: [{
                amountToWithdraw: "MAX",
                withdrawReceiver: SECOND_ACCOUNT,
                withdrawCaller: SECOND_ACCOUNT
              }],
              actionsBefore: {
                requestWithdrawCallers: [SECOND_ACCOUNT],
                countBlocks: 5
              }
            })).revertedWith("NOT_REQUESTED");
          });
        });

        describe("A withdraws to S, S is not allowed to withdraw at this moment", () => {
          const SECOND_ACCOUNT = ethers.Wallet.createRandom().address;

          /**
           *  "A" makes deposit on account of "S" and immediately withdraw amount from his account in favor of "S"
           *
           *  Deposit: A => S (depositor => receiver)
           *  Withdraw: A => A => S (signer => owner => receiver)
           */
          it("should withdraw successfully", async () => {
            const {receivedAmount} = await withdrawRequestsTest({
              deposits: [
                {amountToDeposit: "10", depositor: SECOND_ACCOUNT, receiver: SECOND_ACCOUNT, countBlocks: 5},
                {amountToDeposit: "10"}, // signer => signer
              ],
              withdrawRequestBlocks: 5,
              countBlocks: 0,
              withdraws: [{
                amountToWithdraw: "MAX",
                withdrawOwner: SECOND_ACCOUNT,
                withdrawCaller: SECOND_ACCOUNT
              }]
            });
            expect(receivedAmount).eq(10);
          });
        });
      });
    });
  })
});
