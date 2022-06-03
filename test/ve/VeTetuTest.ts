import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {
  IERC20__factory,
  IERC20Metadata, IERC20Metadata__factory,
  MockPawnshop,
  MockToken,
  MockVoter, ProxyControlled,
  VeTetu, VeTetu__factory
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 365;

describe("veTETU tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let tetu: MockToken;
  let underlying2: MockToken;

  let ve: VeTetu;
  let voter: MockVoter;
  let pawnshop: MockPawnshop;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    underlying2 = await DeployerUtils.deployMockToken(owner, 'UNDERLYING2', 6);
    tetu = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    const controller = await DeployerUtils.deployMockController(owner);
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address);
    voter = await DeployerUtils.deployMockVoter(owner, ve.address);
    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;
    await controller.setVoter(voter.address);
    await controller.setVePawnshop(pawnshop.address);

    await tetu.mint(owner2.address, parseUnits('100'));
    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner2).approve(ve.address, Misc.MAX_UINT);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

    await ve.setApprovalForAll(pawnshop.address, true);
    await ve.connect(owner2).setApprovalForAll(pawnshop.address, true);
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

  it("safeTransfer should revert", async function () {
    await expect(ve["safeTransferFrom(address,address,uint256)"](owner.address, owner2.address, 1)).revertedWith('Forbidden')
  });

  it("double transfer with multiple tokens test", async function () {
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await pawnshop.doubleTransfer(ve.address, owner.address, pawnshop.address, 1)
  });

  it("transfer to non-support contract revert", async function () {
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    await expect(pawnshop.transfer(ve.address, pawnshop.address, tetu.address, 1)).revertedWith('ERC721: transfer to non ERC721Receiver implementer')
  });

  it("transfer to wrong nft receiver", async function () {
    const receiver = await DeployerUtils.deployContract(owner, 'WrongNFTReceiver');
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    await expect(pawnshop.transfer(ve.address, pawnshop.address, receiver.address, 1)).revertedWith('stub revert')
  });

  it("transfer from not owner revert", async function () {
    await tetu.mint(owner3.address, parseUnits('100'));
    await tetu.connect(owner3).approve(ve.address, Misc.MAX_UINT);
    await ve.connect(owner3).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await expect(pawnshop.transfer(ve.address, owner3.address, pawnshop.address, 3)).revertedWith('!owner sender')
  });

  it("balanceOfNft should be zero in the same block of transfer", async function () {
    expect(await pawnshop.callStatic.transferAndGetBalance(ve.address, owner.address, pawnshop.address, 1)).eq(0);
    await pawnshop.transferAndGetBalance(ve.address, owner.address, pawnshop.address, 1);
  });

  it("remove token from owner list for not current index test", async function () {
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    await TimeUtils.advanceNBlocks(1);
    await pawnshop.transfer(ve.address, pawnshop.address, owner.address, 1);
  });

  it("transferFrom with attached token auto detach test", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await voter.voting(1);
    expect(await ve.attachments(1)).eq(1)
    expect(await ve.voted(1)).eq(true)
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1)
    expect(await ve.attachments(1)).eq(0);
    expect(await ve.voted(1)).eq(false);
  });

  it("transferFrom not owner revert test", async function () {
    await expect(pawnshop.transfer(ve.address, owner.address, pawnshop.address, 2)).revertedWith('!owner')
  });

  it("transferFrom zero dst revert test", async function () {
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    await expect(pawnshop.transfer(ve.address, pawnshop.address, Misc.ZERO_ADDRESS, 1)).revertedWith('dst is zero')
  });

  it("transferFrom reset approves test", async function () {
    await ve.approve(owner2.address, 1);
    expect(await ve.isApprovedOrOwner(owner2.address, 1)).eq(true);
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    expect(await ve.isApprovedOrOwner(owner2.address, 1)).eq(false);
  });

  it("transferFrom should revert", async function () {
    await expect(ve.transferFrom(owner.address, pawnshop.address, 1)).revertedWith('Forbidden')
  });

  it("approve invalid id revert test", async function () {
    await expect(ve.approve(owner2.address, 99)).revertedWith('invalid id')
  });

  it("approve from not owner revert", async function () {
    await expect(ve.connect(owner2).approve(owner3.address, 1)).revertedWith('!owner')
  });

  it("approve self approve revert test", async function () {
    await expect(ve.approve(owner.address, 1)).revertedWith('self approve')
  });

  it("setApprovalForAll operator is sender revert test", async function () {
    await expect(ve.setApprovalForAll(owner.address, true)).revertedWith('operator is sender')
  });

  it("mint to zero dst revert test", async function () {
    await expect(ve.createLockFor(tetu.address, 1, LOCK_PERIOD, Misc.ZERO_ADDRESS)).revertedWith('zero dst')
  });

  it("voting revert", async function () {
    await expect(ve.voting(1)).revertedWith('!voter')
  });

  it("voting test", async function () {
    await voter.voting(1);
  });

  it("abstain revert", async function () {
    await expect(ve.abstain(1)).revertedWith('!voter')
  });

  it("abstain test", async function () {
    await voter.abstain(1);
  });

  it("attach revert", async function () {
    await expect(ve.attachToken(1)).revertedWith('!voter')
  });

  it("attach too many revert", async function () {
    const max = await ve.MAX_ATTACHMENTS();
    for (let i = 0; i < max.toNumber(); i++) {
      await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    }
    await expect(voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS)).revertedWith('Too many attachments');
  });

  it("detach revert", async function () {
    await expect(ve.detachToken(1)).revertedWith('!voter')
  });

  it("increaseAmount for test", async function () {
    await ve.increaseAmount(tetu.address, 1, parseUnits('1'));
  });

  it("create lock zero value revert", async function () {
    await expect(ve.createLock(tetu.address, 0, 1)).revertedWith('zero value')
  });

  it("create lock zero period revert", async function () {
    await expect(ve.createLock(tetu.address, 1, 0)).revertedWith('1 week min lock period')
  });

  it("create lock too big period revert", async function () {
    await expect(ve.createLock(tetu.address, 1, 1e12)).revertedWith('Voting lock can be 1 year max')
  });

  it("increaseAmount zero value revert", async function () {
    await expect(ve.increaseAmount(tetu.address, 1, 0)).revertedWith('zero value')
  });

  it("increaseAmount zero value revert", async function () {
    await expect(ve.increaseAmount(underlying2.address, 1, 1)).revertedWith('Not valid token')
  });

  it("increaseAmount not locked revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await ve.withdraw(tetu.address, 1);
    await expect(ve.increaseAmount(tetu.address, 1, 1)).revertedWith('No existing lock found')
  });

  it("increaseAmount expired revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await expect(ve.increaseAmount(tetu.address, 1, 1)).revertedWith('Cannot add to expired lock. Withdraw')
  });

  it("increaseUnlockTime not owner revert", async function () {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await expect(ve.increaseUnlockTime(2, LOCK_PERIOD)).revertedWith('!owner')
  });

  it("increaseUnlockTime lock expired revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await expect(ve.increaseUnlockTime(1, 1)).revertedWith('Lock expired')
  });

  it("increaseUnlockTime not locked revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await ve.withdraw(tetu.address, 1);
    await expect(ve.increaseUnlockTime(1, LOCK_PERIOD)).revertedWith('Nothing is locked')
  });

  it("increaseUnlockTime zero extend revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await expect(ve.increaseUnlockTime(1, 0)).revertedWith('Can only increase lock duration')
  });

  it("increaseUnlockTime too big extend revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await expect(ve.increaseUnlockTime(1, 1e12)).revertedWith('Voting lock can be 1 year max')
  });

  it("withdraw not owner revert", async function () {
    await expect(ve.withdraw(tetu.address, 2)).revertedWith('!owner')
  });

  it("withdraw attached revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await expect(ve.withdraw(tetu.address, 1)).revertedWith('attached');
  });

  it("withdraw voted revert", async function () {
    await voter.voting(1);
    await expect(ve.withdraw(tetu.address, 1)).revertedWith('attached');
  });

  it("withdraw zero revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD)
    await expect(ve.withdraw(underlying2.address, 1)).revertedWith("Zero locked");
  });

  it("withdraw not expired revert", async function () {
    await expect(ve.withdraw(tetu.address, 1)).revertedWith('The lock did not expire');
  });

  it("balanceOfNFT zero epoch test", async function () {
    expect(await ve.balanceOfNFT(99)).eq(0);
  });

  it("tokenURI for not exist revert", async function () {
    await expect(ve.tokenURI(99)).revertedWith('Query for nonexistent token');
  });

  it("balanceOfNFTAt for new block revert", async function () {
    await expect(ve.balanceOfAtNFT(1, Date.now() * 10)).revertedWith('only old block');
  });

  it("totalSupplyAt for new block revert", async function () {
    await expect(ve.totalSupplyAt(Date.now() * 10)).revertedWith('only old blocks');
  });

  it("tokenUri for expired lock", async function () {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 5);
    expect(await ve.tokenURI(1)).not.eq('');
  });

  it("totalSupplyAt for not exist epoch", async function () {
    expect(await ve.totalSupplyAt(0)).eq(0);
  });

  it("totalSupplyAt for first epoch", async function () {
    const start = (await ve.pointHistory(0)).blk;
    expect(await ve.totalSupplyAt(start)).eq(0);
    expect(await ve.totalSupplyAt(start.add(1))).eq(0);
  });

  it("totalSupplyAt for second epoch", async function () {
    const start = (await ve.pointHistory(1)).blk;
    expect(await ve.totalSupplyAt(start)).not.eq(0);
    expect(await ve.totalSupplyAt(start.add(1))).not.eq(0);
  });

  it("checkpoint for a long period", async function () {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await ve.checkpoint();
  });

  it("balanceOfNFTAt with history test", async function () {
    const cp0 = (await ve.userPointHistory(2, 0));
    await ve.balanceOfAtNFT(2, cp0.blk);
    const cp1 = (await ve.userPointHistory(2, 1));
    await TimeUtils.advanceNBlocks(1);
    await ve.balanceOfAtNFT(2, cp1.blk.add(1));
  });


  it("supportsInterface test", async function () {
    expect(await ve.supportsInterface('0x00000000')).is.eq(false);
  });

  it("get_last_user_slope test", async function () {
    expect(await ve.getLastUserSlope(0)).is.eq(0);
  });

  it("user_point_history__ts test", async function () {
    expect(await ve.userPointHistoryTs(0, 0)).is.eq(0);
  });

  it("locked__end test", async function () {
    expect(await ve.lockedEnd(0)).is.eq(0);
  });

  it("balanceOf test", async function () {
    expect(await ve.balanceOf(owner.address)).is.eq(1);
  });

  it("getApproved test", async function () {
    expect(await ve.getApproved(owner.address)).is.eq(Misc.ZERO_ADDRESS);
  });

  it("isApprovedForAll test", async function () {
    expect(await ve.isApprovedForAll(owner.address, owner.address)).is.eq(false);
  });

  it("tokenOfOwnerByIndex test", async function () {
    expect(await ve.tokenOfOwnerByIndex(owner.address, 0)).is.eq(1);
  });

  it("setApprovalForAll test", async function () {
    await ve.setApprovalForAll(owner2.address, true);
  });

  it("increase_unlock_time test", async function () {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await ve.increaseUnlockTime(1, LOCK_PERIOD);
    await expect(ve.increaseUnlockTime(1, LOCK_PERIOD * 2)).revertedWith('Voting lock can be 1 year max');
  });

  it("tokenURI test", async function () {
    await ve.tokenURI(1);
  });

  it("balanceOfNFTAt test", async function () {
    await ve.balanceOfNFTAt(1, 0);
  });

  it("ve flesh transfer + supply checks", async function () {
    await pawnshop.veFlashTransfer(ve.address, 1);
  });

  it("invalid token lock revert", async function () {
    await expect(ve.createLock(owner.address, parseUnits('1'), LOCK_PERIOD)).revertedWith('Not valid token');
  });

  it("add token from non gov revert", async function () {
    await expect(ve.connect(owner2).addToken(underlying2.address, parseUnits('1'))).revertedWith('Not governance');
  });

  it("token wrong decimals revert", async function () {
    const controller = await DeployerUtils.deployMockController(owner);
    const logic = await DeployerUtils.deployContract(owner, 'VeTetu');
    const proxy = await DeployerUtils.deployContract(owner, 'ProxyControlled', logic.address) as ProxyControlled;
    await expect(VeTetu__factory.connect(proxy.address, owner).init(
      underlying2.address,
      controller.address
    )).revertedWith('Token wrong decimals')
  });

  it("deposit/withdraw test", async function () {
    let balTETU = await tetu.balanceOf(owner.address);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);

    await ve.withdraw(tetu.address, 1)
    await ve.connect(owner2).withdraw(tetu.address, 2);

    expect(await underlying2.balanceOf(ve.address)).eq(0);
    expect(await tetu.balanceOf(ve.address)).eq(0);

    expect(await tetu.balanceOf(owner.address)).eq(balTETU.add(parseUnits('1')));

    balTETU = await tetu.balanceOf(owner.address);
    const balUNDERLYING2 = await underlying2.balanceOf(owner.address);

    await ve.addToken(underlying2.address, parseUnits('10'));

    await ve.createLock(tetu.address, parseUnits('0.77'), LOCK_PERIOD)
    await TimeUtils.advanceNBlocks(5);
    await underlying2.approve(ve.address, Misc.MAX_UINT);
    await ve.increaseAmount(underlying2.address, 3, parseUnits('0.33', 6))
    expect(await underlying2.balanceOf(owner.address)).eq(balUNDERLYING2.sub(parseUnits('0.33', 6)));
    await ve.increaseAmount(underlying2.address, 3, parseUnits('0.37', 6))
    expect(await underlying2.balanceOf(owner.address)).eq(balUNDERLYING2.sub(parseUnits('0.7', 6)));

    expect(formatUnits(await ve.lockedDerivedAmount(3))).eq('0.84');
    expect(+formatUnits(await ve.balanceOfNFT(3))).above(0.83);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD / 2);

    expect(+formatUnits(await ve.balanceOfNFT(3))).above(0.41);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD / 2);

    await ve.withdraw(underlying2.address, 3);
    await ve.withdraw(tetu.address, 3);

    expect(await ve.ownerOf(3)).eq(Misc.ZERO_ADDRESS);

    expect(await underlying2.balanceOf(ve.address)).eq(0);
    expect(await tetu.balanceOf(ve.address)).eq(0);

    expect(await underlying2.balanceOf(owner.address)).eq(balUNDERLYING2);
    expect(await tetu.balanceOf(owner.address)).eq(balTETU);
  });

  it("deposit/withdraw in a loop", async function () {
    // clear all locks
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await ve.withdraw(tetu.address, 1)
    await ve.connect(owner2).withdraw(tetu.address, 2);

    // prepare
    await ve.addToken(underlying2.address, parseUnits('10'));
    await tetu.mint(owner2.address, parseUnits('1000000000'))
    await underlying2.mint(owner2.address, parseUnits('1000000000'))
    await underlying2.approve(ve.address, Misc.MAX_UINT);
    await underlying2.connect(owner2).approve(ve.address, Misc.MAX_UINT);

    const balTETUOwner1 = await tetu.balanceOf(owner.address);
    const balUNDERLYING2Owner1 = await underlying2.balanceOf(owner.address);
    const balTETUOwner2 = await tetu.balanceOf(owner2.address);
    const balUNDERLYING2Owner2 = await underlying2.balanceOf(owner2.address);

    const loops = 10;
    const lockDivider = Math.ceil(loops / 3);
    for (let i = 1; i < loops; i++) {
      let stakingToken;
      if (i % 2 === 0) {
        stakingToken = tetu.address;
      } else {
        stakingToken = underlying2.address;
      }
      const dec = await IERC20Metadata__factory.connect(stakingToken, owner).decimals();
      const amount = parseUnits('0.123453', dec).mul(i);

      await depositOrWithdraw(
        owner,
        ve,
        stakingToken,
        amount,
        WEEK * Math.ceil(i / lockDivider)
      );
      await depositOrWithdraw(
        owner2,
        ve,
        stakingToken,
        amount,
        WEEK * Math.ceil(i / lockDivider)
      );
      await TimeUtils.advanceBlocksOnTs(WEEK);
    }

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);

    await withdrawIfExist(owner, ve, tetu.address);
    await withdrawIfExist(owner, ve, underlying2.address);
    await withdrawIfExist(owner2, ve, tetu.address);
    await withdrawIfExist(owner2, ve, underlying2.address);

    expect(await underlying2.balanceOf(ve.address)).eq(0);
    expect(await tetu.balanceOf(ve.address)).eq(0);

    expect(await underlying2.balanceOf(owner.address)).eq(balUNDERLYING2Owner1);
    expect(await tetu.balanceOf(owner.address)).eq(balTETUOwner1);
    expect(await underlying2.balanceOf(owner2.address)).eq(balUNDERLYING2Owner2);
    expect(await tetu.balanceOf(owner2.address)).eq(balTETUOwner2);
  });

});


async function depositOrWithdraw(
  owner: SignerWithAddress,
  ve: VeTetu,
  stakingToken: string,
  amount: BigNumber,
  lock: number,
) {
  const veIdLength = await ve.balanceOf(owner.address);
  expect(veIdLength).below(2);
  if (veIdLength.isZero()) {
    console.log('create lock')
    await ve.connect(owner).createLock(stakingToken, amount, lock);
  } else {
    const veId = await ve.tokenOfOwnerByIndex(owner.address, 0);
    const locked = await ve.lockedAmounts(veId, stakingToken);
    if (!locked.isZero()) {
      const lockEnd = (await ve.lockedEnd(veId)).toNumber();
      const now = (await ve.blockTimestamp()).toNumber()
      if (now >= lockEnd) {
        console.log('withdraw', veId.toNumber())
        await ve.connect(owner).withdraw(stakingToken, veId);
      } else {
        console.log('lock not ended yet', lockEnd, lockEnd - now, veId.toNumber());
      }
    } else {
      console.log('no lock for this token')
    }
  }
}

async function withdrawIfExist(
  owner: SignerWithAddress,
  ve: VeTetu,
  stakingToken: string
) {
  const veIdLength = await ve.balanceOf(owner.address);
  expect(veIdLength).below(2);
  if (!veIdLength.isZero()) {
    const veId = await ve.tokenOfOwnerByIndex(owner.address, 0);
    const locked = await ve.lockedAmounts(veId, stakingToken);
    if (!locked.isZero()) {
      const lockEnd = (await ve.lockedEnd(veId)).toNumber();
      const now = (await ve.blockTimestamp()).toNumber()
      if (now >= lockEnd) {
        console.log('withdraw', veId.toNumber())
        await ve.connect(owner).withdraw(stakingToken, veId);
      }
    }
  }
}
