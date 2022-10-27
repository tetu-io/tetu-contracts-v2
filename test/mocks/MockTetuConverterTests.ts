import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {MockTetuConverter, MockToken} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {parseUnits} from "ethers/lib/utils";
import {expect} from "chai";
import {constants} from "ethers";

/// @notice Minimal smoke tests with no apr fees for now

describe("MockTetuConverter helper Tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let _signer: string;
  let strategy: SignerWithAddress;

  const AUTO_0 = '0';
  const SWAP_1 = '1';
  const BORROW_2 = '2';

  const _amount = parseUnits('100', 18);

  let token: MockToken;
  let token2: MockToken;
  let _token: string;
  let _token2: string;
  let tc: MockTetuConverter;
  let _tc: string;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, strategy] = await ethers.getSigners();
    _signer = signer.address;

    token = await DeployerUtils.deployMockToken(signer, 'COLLATERAL');
    token2 = await DeployerUtils.deployMockToken(signer, 'BORROWED', 18, '0');
    _token = token.address;
    _token2 = token2.address;
    const rewardTokens = [_token, _token2];
    const rewardAmounts = [1000000, 2000000];
    tc = await DeployerUtils.deployContract(signer, 'MockTetuConverter',
      rewardTokens, rewardAmounts) as MockTetuConverter;
    _tc = tc.address;

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

  describe('findConversionStrategy', async function () {

    it("SWAP_1", async () => {
      const s = await tc.findConversionStrategy(_token, _amount, _token2, 0, SWAP_1);

      expect(s.maxTargetAmount).eq(_amount);
    });

    it("BORROW_2", async () => {
      const s = await tc.findConversionStrategy(_token, _amount, _token2, 0, BORROW_2);
      const borrowRate2 = await tc.borrowRate2();
      expect(s.maxTargetAmount).eq(_amount.mul(borrowRate2).div(10**2));
    });

    it("AUTO_0 should work as BORROW_2", async () => {
      const s = await tc.findConversionStrategy(
        _token, _amount, _token2, 0, AUTO_0);
      const borrowRate2 = await tc.borrowRate2();
      expect(s.maxTargetAmount).eq(_amount.mul(borrowRate2).div(10**2));
      expect(s.converter).eq('0x0000000000000000000000000000000000000002');
    });

  });

  describe('borrow', async function () {

    it("SWAP_1", async () => {
      const s = await tc.findConversionStrategy(_token, _amount, _token2, 0, SWAP_1);
      await token.transfer(_tc, _amount);
      await tc.borrow(s.converter, _token, _amount, _token2, s.maxTargetAmount, _signer);
      const balance = await token2.balanceOf(_signer);
      expect(s.maxTargetAmount).eq(balance);
    });

    it("BORROW_2", async () => {
      const s = await tc.findConversionStrategy(_token, _amount, _token2, 0, BORROW_2);
      await token.transfer(_tc, _amount);
      await tc.borrow(s.converter, _token, _amount, _token2, s.maxTargetAmount, _signer);
      const balance = await token2.balanceOf(_signer);
      expect(s.maxTargetAmount).eq(balance);
    });

    it("AUTO_0", async () => {
      const amount = parseUnits('100', 18);
      const s = await tc.findConversionStrategy(_token, amount, _token2, 0, AUTO_0);
      await token.transfer(_tc, amount);
      const borrowPromise = tc.borrow(constants.AddressZero, _token, amount, _token2, s.maxTargetAmount, _signer);
      expect(borrowPromise).revertedWith('MTC: Wrong converter');
    });

  });
  describe('repay', async function () {

    it("with no debt / SWAP", async () => {
      await token2.mint(_tc, _amount);
      const balanceBefore = await token.balanceOf(_signer);

      await tc.repay(_token, _token2, _amount, _signer);

      const balanceAfter = await token.balanceOf(_signer);
      const received = balanceAfter.sub(balanceBefore);
      expect(received).eq(_amount);
    });

    it("full repay", async () => {
      const s = await tc.findConversionStrategy(_token, _amount, _token2, 0, BORROW_2);
      await token.transfer(_tc, _amount);
      await tc.borrow(s.converter, _token, _amount, _token2, s.maxTargetAmount, _signer);

      const balanceBefore = await token.balanceOf(_signer);

      await token2.transfer(_tc, s.maxTargetAmount);
      await tc.repay(_token, _token2, s.maxTargetAmount, _signer);

      const balanceAfter = await token.balanceOf(_signer);
      const received = balanceAfter.sub(balanceBefore);
      expect(received).eq(_amount);
    });

    it("full repay with swap", async () => {
      const s1 = await tc.findConversionStrategy(_token, _amount, _token2, 0, SWAP_1);
      await token.transfer(_tc, _amount);
      await tc.borrow(s1.converter, _token, _amount, _token2, s1.maxTargetAmount, _signer);

      const s2 = await tc.findConversionStrategy(_token, _amount, _token2, 0, BORROW_2);
      await token.transfer(_tc, _amount);
      await tc.borrow(s2.converter, _token, _amount, _token2, s2.maxTargetAmount, _signer);

      const totalTargetAmount = s1.maxTargetAmount.add(s2.maxTargetAmount);
      const token2Balance = await token2.balanceOf(_signer);
      expect(token2Balance).eq(totalTargetAmount);

      const balanceBefore = await token.balanceOf(_signer);
      await token2.transfer(_tc, totalTargetAmount);
      await tc.repay(_token, _token2, totalTargetAmount, _signer);

      const balanceAfter = await token.balanceOf(_signer);
      const received = balanceAfter.sub(balanceBefore);
      expect(received).eq(_amount.mul(2));
    });



  });

})
