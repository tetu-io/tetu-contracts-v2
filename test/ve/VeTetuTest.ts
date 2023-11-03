import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {
  IERC20Metadata__factory,
  MockPawnshop,
  MockToken,
  MockVoter,
  ProxyControlled,
  VeTetu,
  VeTetu__factory
} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";
import {checkTotalVeSupplyAtTS, currentEpochTS} from "../test-utils";

const {expect} = chai;

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 90;
const MAX_LOCK = 60 * 60 * 24 * 7 * 16;

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
    ve = await DeployerUtils.deployVeTetu(owner, tetu.address, controller.address, parseUnits('100'));
    voter = await DeployerUtils.deployMockVoter(owner, ve.address);
    pawnshop = await DeployerUtils.deployContract(owner, 'MockPawnshop') as MockPawnshop;

    const veDist = await DeployerUtils.deployVeDistributor(
      owner,
      controller.address,
      ve.address,
      tetu.address,
    );

    await controller.setVeDistributor(veDist.address);
    await controller.setVoter(voter.address);
    await ve.announceAction(2);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await ve.whitelistTransferFor(pawnshop.address);

    await tetu.mint(owner2.address, parseUnits('100'));
    await tetu.approve(ve.address, Misc.MAX_UINT);
    await tetu.connect(owner2).approve(ve.address, Misc.MAX_UINT);
    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);
    await ve.connect(owner2).createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

    await ve.setApprovalForAll(pawnshop.address, true);
    await ve.connect(owner2).setApprovalForAll(pawnshop.address, true);

    const platformVoter = await DeployerUtils.deployPlatformVoter(owner, controller.address, ve.address);
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

  it("init twice revert", async function () {
    await expect(ve.init(Misc.ZERO_ADDRESS, 0, Misc.ZERO_ADDRESS)).revertedWith('Initializable: contract is already initialized');
  });

  it("token length test", async function () {
    expect(await ve.tokensLength()).eq(1);
  });

  it("safeTransfer should revert", async function () {
    await expect(ve["safeTransferFrom(address,address,uint256)"](owner.address, owner2.address, 1)).revertedWith('FORBIDDEN')
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
    await expect(pawnshop.transfer(ve.address, owner3.address, pawnshop.address, 3)).revertedWith('NOT_OWNER')
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
    expect(await ve.isVoted(1)).eq(true)
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1)
    expect(await ve.attachments(1)).eq(0);
    expect(await ve.isVoted(1)).eq(false)
  });

  it("transferFrom not owner revert test", async function () {
    await expect(pawnshop.transfer(ve.address, owner.address, pawnshop.address, 2)).revertedWith('NOT_OWNER')
  });

  it("transferFrom zero dst revert test", async function () {
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    await expect(pawnshop.transfer(ve.address, pawnshop.address, Misc.ZERO_ADDRESS, 1)).revertedWith('WRONG_INPUT')
  });

  it("transferFrom reset approves test", async function () {
    await ve.approve(owner2.address, 1);
    expect(await ve.isApprovedOrOwner(owner2.address, 1)).eq(true);
    await pawnshop.transfer(ve.address, owner.address, pawnshop.address, 1);
    expect(await ve.isApprovedOrOwner(owner2.address, 1)).eq(false);
  });

  it("transferFrom should revert", async function () {
    await expect(ve.transferFrom(owner.address, pawnshop.address, 1)).revertedWith('FORBIDDEN')
  });

  it("approve invalid id revert test", async function () {
    await expect(ve.approve(owner2.address, 99)).revertedWith('WRONG_INPUT')
  });

  it("approve from not owner revert", async function () {
    await expect(ve.connect(owner2).approve(owner3.address, 1)).revertedWith('NOT_OWNER')
  });

  it("approve self approve revert test", async function () {
    await expect(ve.approve(owner.address, 1)).revertedWith('IDENTICAL_ADDRESS')
  });

  it("setApprovalForAll operator is sender revert test", async function () {
    await expect(ve.setApprovalForAll(owner.address, true)).revertedWith('IDENTICAL_ADDRESS')
  });

  it("mint to zero dst revert test", async function () {
    await expect(ve.createLockFor(tetu.address, 1, LOCK_PERIOD, Misc.ZERO_ADDRESS)).revertedWith('WRONG_INPUT')
  });

  // it("voting revert", async function () {
  //   await expect(ve.voting(1)).revertedWith('NOT_VOTER')
  // });

  it("voting test", async function () {
    await voter.voting(1);
  });

  // it("abstain revert", async function () {
  //   await expect(ve.abstain(1)).revertedWith('NOT_VOTER')
  // });

  it("abstain test", async function () {
    await voter.voting(1);
    await voter.abstain(1);
  });

  it("changeTokenFarmingAllowanceStatus test", async function () {
    await ve.changeTokenFarmingAllowanceStatus(underlying2.address, true);
  });

  it("stakeAvailableTokens test", async function () {
    await ve.stakeAvailableTokens(underlying2.address);
    await ve.changeTokenFarmingAllowanceStatus(underlying2.address, true);
    await ve.stakeAvailableTokens(underlying2.address);
    await ve.stakeAvailableTokens('0xE2f706EF1f7240b803AAe877C9C762644bb808d8');
  });

  it("emergencyWithdrawStakedTokens test", async function () {
    await ve.emergencyWithdrawStakedTokens(underlying2.address);
  });

  it("attach revert", async function () {
    await expect(ve.attachToken(1)).revertedWith('NOT_VOTER')
  });

  it("attach too many revert", async function () {
    const max = await ve.MAX_ATTACHMENTS();
    for (let i = 0; i < max.toNumber(); i++) {
      await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    }
    await expect(voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS)).revertedWith('TOO_MANY_ATTACHMENTS');
  });

  it("detach revert", async function () {
    await expect(ve.detachToken(1)).revertedWith('NOT_VOTER')
  });

  it("increaseAmount for test", async function () {
    await ve.increaseAmount(tetu.address, 1, parseUnits('1'));
  });

  it("create lock zero value revert", async function () {
    await expect(ve.createLock(tetu.address, 0, 1)).revertedWith('WRONG_INPUT')
  });

  it("create lock zero period revert", async function () {
    await expect(ve.createLock(tetu.address, 1, 0)).revertedWith('LOW_LOCK_PERIOD')
  });

  it("create lock too big period revert", async function () {
    await expect(ve.createLock(tetu.address, 1, 1e12)).revertedWith('HIGH_LOCK_PERIOD')
  });

  it("increaseAmount zero value revert", async function () {
    await expect(ve.increaseAmount(tetu.address, 1, 0)).revertedWith('WRONG_INPUT')
  });

  it("increaseAmount zero value revert", async function () {
    await expect(ve.increaseAmount(underlying2.address, 1, 1)).revertedWith('INVALID_TOKEN')
  });

  it("increaseAmount not locked revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await ve.withdraw(tetu.address, 1);
    await expect(ve.increaseAmount(tetu.address, 1, 1)).revertedWith('NFT_WITHOUT_POWER')
  });

  it("increaseAmount expired revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await expect(ve.increaseAmount(tetu.address, 1, 1)).revertedWith('EXPIRED')
  });

  it("increaseUnlockTime not owner revert", async function () {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await expect(ve.increaseUnlockTime(2, LOCK_PERIOD)).revertedWith('NOT_OWNER')
  });

  it("increaseUnlockTime lock expired revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await expect(ve.increaseUnlockTime(1, 1)).revertedWith('EXPIRED')
  });

  it("increaseUnlockTime not locked revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await ve.withdraw(tetu.address, 1);
    await expect(ve.increaseUnlockTime(1, LOCK_PERIOD)).revertedWith('NFT_WITHOUT_POWER')
  });

  it("increaseUnlockTime zero extend revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await expect(ve.increaseUnlockTime(1, 0)).revertedWith('LOW_UNLOCK_TIME')
  });

  it("increaseUnlockTime too big extend revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await expect(ve.increaseUnlockTime(1, 1e12)).revertedWith('HIGH_LOCK_PERIOD')
  });

  it("withdraw not owner revert", async function () {
    await expect(ve.withdraw(tetu.address, 2)).revertedWith('NOT_OWNER')
  });

  it("withdraw attached revert", async function () {
    await voter.attachTokenToGauge(Misc.ZERO_ADDRESS, 1, Misc.ZERO_ADDRESS);
    await expect(ve.withdraw(tetu.address, 1)).revertedWith('ATTACHED');
  });

  it("withdraw voted revert", async function () {
    await voter.voting(1);
    await expect(ve.withdraw(tetu.address, 1)).revertedWith('ATTACHED');
  });

  it("merge from revert", async function () {
    await expect(ve.merge(1, 3)).revertedWith('NOT_OWNER')
  });

  it("merge to revert", async function () {
    await expect(ve.merge(3, 1)).revertedWith('NOT_OWNER')
  });

  it("merge same revert", async function () {
    await expect(ve.merge(1, 1)).revertedWith('IDENTICAL_ADDRESS')
  });

  it("merge attached revert", async function () {
    await voter.voting(1);
    await expect(ve.merge(1, 2)).revertedWith('ATTACHED')
  });

  it("split attached revert", async function () {
    await voter.voting(1);
    await expect(ve.split(1, 100)).revertedWith('ATTACHED')
  });

  it("split zero percent revert", async function () {
    await expect(ve.split(1, 0)).revertedWith("WRONG_INPUT")
  });

  it("split expired revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD)
    await expect(ve.split(1, 1)).revertedWith('EXPIRED')
  });

  it("split withdrew revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD)
    await ve.withdraw(tetu.address, 1);
    await expect(ve.split(1, 1)).revertedWith('NOT_OWNER')
  });

  it("split too low percent revert", async function () {
    await expect(ve.split(1, 1)).revertedWith("LOW_PERCENT")
  });

  it("split not owner revert", async function () {
    await expect(ve.split(3, 1)).revertedWith("NOT_OWNER")
  });

  it("withdraw zero revert", async function () {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD)
    await expect(ve.withdraw(underlying2.address, 1)).revertedWith("ZERO_LOCKED");
  });

  it("withdraw not expired revert", async function () {
    await expect(ve.withdraw(tetu.address, 1)).revertedWith('NOT_EXPIRED');
  });

  it("balanceOfNFT zero epoch test", async function () {
    expect(await ve.balanceOfNFT(99)).eq(0);
  });

  it("tokenURI for not exist revert", async function () {
    await expect(ve.tokenURI(99)).revertedWith('TOKEN_NOT_EXIST');
  });

  it("totalSupplyAt for new block revert", async function () {
    await expect(ve.totalSupplyAt(Date.now() * 10)).revertedWith('WRONG_INPUT');
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

  it("totalSupplyAtT test", async function () {
    const curBlock = await owner.provider?.getBlockNumber() ?? -1;
    const blockTs = (await owner.provider?.getBlock(curBlock))?.timestamp ?? -1;
    expect(curBlock).not.eq(-1);
    expect(blockTs).not.eq(-1);
    const supply = +formatUnits(await ve.totalSupply());
    const supplyBlock = +formatUnits(await ve.totalSupplyAt(curBlock));
    const supplyTsNow = +formatUnits(await ve.totalSupplyAtT(blockTs));
    console.log('supply', supply);
    console.log('supplyBlock', supplyBlock);
    console.log('supplyTsNow', supplyTsNow);

    expect(supply).eq(supplyBlock);
    expect(supplyTsNow).eq(supplyBlock);

    const supplyTs = +formatUnits(await ve.totalSupplyAtT(await currentEpochTS()));
    console.log('supplyTs', supplyTs);

    await checkTotalVeSupplyAtTS(ve, await currentEpochTS() + WEEK)

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

  it("supportsInterface positive test", async function () {
    expect(await ve.supportsInterface('0x01ffc9a7')).is.eq(true);
    expect(await ve.supportsInterface('0x80ac58cd')).is.eq(true);
    expect(await ve.supportsInterface('0x5b5e139f')).is.eq(true);
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
    await expect(ve.increaseUnlockTime(1, LOCK_PERIOD * 2)).revertedWith('HIGH_LOCK_PERIOD');
  });

  it("tokenURI test", async function () {
    await ve.createLock(tetu.address, parseUnits('333'), LOCK_PERIOD);
    const uri = (await ve.tokenURI(3))
    console.log(uri);
    const base64 = uri.replace('data:application/json;base64,', '');
    console.log(base64);

    const uriJson = Buffer.from(base64, 'base64').toString('binary');
    console.log(uriJson);
    const imgBase64 = JSON.parse(uriJson).image.replace('data:image/svg+xml;base64,', '');
    console.log(imgBase64);
    const svg = Buffer.from(imgBase64, 'base64').toString('binary');
    console.log(svg);
    expect(svg).contains('333')
    // expect(svg).contains('88 days')
  });

  it("balanceOfNFTAt test", async function () {
    // ve #3
    await ve.createLock(tetu.address, parseUnits('100'), LOCK_PERIOD);
    const tId = 3;

    const curBlockB = await owner.provider?.getBlockNumber() ?? -1;
    const blockTsB = (await owner.provider?.getBlock(curBlockB))?.timestamp ?? -1;


    const curBlock = await owner.provider?.getBlockNumber() ?? -1;
    const blockTs = (await owner.provider?.getBlock(curBlock))?.timestamp ?? -1;
    const current = +formatUnits(await ve.balanceOfNFTAt(tId, blockTs));
    console.log('>>> current', current);
    expect(current).approximately(75, 10);
    const zero = +formatUnits(await ve.balanceOfNFTAt(tId, 0));
    const future = +formatUnits(await ve.balanceOfNFTAt(tId, 999_999_999_999));
    const beforeLock = +formatUnits(await ve.balanceOfNFTAt(tId, blockTsB - 1000));
    expect(zero).eq(0);
    expect(future).eq(0);
    expect(beforeLock).eq(0);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.increaseAmount(tetu.address, tId, parseUnits('1000'));

    const curBlockA = await owner.provider?.getBlockNumber() ?? -1;
    const blockTsA = (await owner.provider?.getBlock(curBlockA))?.timestamp ?? -1;
    const beforeLockAfterIncrease = +formatUnits(await ve.balanceOfNFTAt(tId, blockTsA - 1000));
    console.log('>>> beforeLockAfterIncrease', beforeLockAfterIncrease);
    expect(beforeLockAfterIncrease).approximately(75, 10);

    const currentA = +formatUnits(await ve.balanceOfNFTAt(tId, blockTsA));
    console.log('>>> currentA', currentA);
    expect(currentA).approximately(700, 100);
  });

  it("balanceOfAtNFT test", async function () {
    await TimeUtils.advanceNBlocks(100)
    // ve #3
    await ve.createLock(tetu.address, parseUnits('100'), LOCK_PERIOD);
    const tId = 3;

    const curBlockB = await owner.provider?.getBlockNumber() ?? -1;


    const curBlock = await owner.provider?.getBlockNumber() ?? -1;
    const current = +formatUnits(await ve.balanceOfAtNFT(tId, curBlock));
    console.log('>>> current', current);
    expect(current).approximately(75, 10);
    const zero = +formatUnits(await ve.balanceOfAtNFT(tId, 0));
    const future = +formatUnits(await ve.balanceOfAtNFT(tId, 999_999_999_999));
    const beforeLock = +formatUnits(await ve.balanceOfAtNFT(tId, curBlockB - 10));
    expect(zero).eq(0);
    expect(future).eq(0);
    expect(beforeLock).eq(0);

    await TimeUtils.advanceNBlocks(100)
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.increaseAmount(tetu.address, tId, parseUnits('1000'));

    const curBlockA = await owner.provider?.getBlockNumber() ?? -1;
    const beforeLockAfterIncrease = +formatUnits(await ve.balanceOfAtNFT(tId, curBlockA - 10));
    console.log('>>> beforeLockAfterIncrease', beforeLockAfterIncrease);
    expect(beforeLockAfterIncrease).approximately(75, 10);

    const currentA = +formatUnits(await ve.balanceOfAtNFT(tId, curBlockA));
    console.log('>>> currentA', currentA);
    expect(currentA).approximately(700, 100);
  });

  it("ve flesh transfer + supply checks", async function () {
    await pawnshop.veFlashTransfer(ve.address, 1);
  });

  it("invalid token lock revert", async function () {
    await expect(ve.createLock(owner.address, parseUnits('1'), LOCK_PERIOD)).revertedWith('INVALID_TOKEN');
  });

  it("whitelist transfer not gov revert", async function () {
    await expect(ve.connect(owner2).whitelistTransferFor(underlying2.address)).revertedWith('FORBIDDEN');
  });

  it("whitelist transfer zero adr revert", async function () {
    await expect(ve.whitelistTransferFor(Misc.ZERO_ADDRESS)).revertedWith('WRONG_INPUT');
  });

  it("whitelist transfer time-lock revert", async function () {
    await ve.announceAction(2);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 17);
    await expect(ve.whitelistTransferFor(owner.address)).revertedWith('TIME_LOCK');
  });

  it("add token from non gov revert", async function () {
    await expect(ve.connect(owner2).addToken(underlying2.address, parseUnits('1'))).revertedWith('FORBIDDEN');
  });

  it("announce from non gov revert", async function () {
    await expect(ve.connect(owner2).announceAction(1)).revertedWith('FORBIDDEN');
  });

  it("announce from wrong input revert", async function () {
    await expect(ve.announceAction(0)).revertedWith('WRONG_INPUT');
    await ve.announceAction(1);
    await expect(ve.announceAction(1)).revertedWith('WRONG_INPUT');
  });

  it("add token twice revert", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await expect(ve.addToken(tetu.address, parseUnits('1'))).revertedWith('WRONG_INPUT');
  });

  it("add token time-lock revert", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 17);
    await expect(ve.addToken(tetu.address, parseUnits('1'))).revertedWith('TIME_LOCK');
  });

  it("add token wrong input revert", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await expect(ve.addToken(Misc.ZERO_ADDRESS, parseUnits('1'))).revertedWith('WRONG_INPUT');
    await expect(ve.addToken(underlying2.address, 0)).revertedWith('WRONG_INPUT');
  });

  it("token wrong decimals revert", async function () {
    const controller = await DeployerUtils.deployMockController(owner);
    const logic = await DeployerUtils.deployContract(owner, 'VeTetu');
    const proxy = await DeployerUtils.deployContract(owner, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    await expect(VeTetu__factory.connect(proxy.address, owner).init(
      underlying2.address,
      parseUnits('1'),
      controller.address
    )).revertedWith('Transaction reverted without a reason string')
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

    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await ve.addToken(underlying2.address, parseUnits('10'));

    await ve.createLock(tetu.address, parseUnits('0.77'), LOCK_PERIOD)
    await TimeUtils.advanceNBlocks(5);
    await underlying2.approve(ve.address, Misc.MAX_UINT);
    await ve.increaseAmount(underlying2.address, 3, parseUnits('0.33', 6))
    expect(await underlying2.balanceOf(owner.address)).eq(balUNDERLYING2.sub(parseUnits('0.33', 6)));
    await ve.increaseAmount(underlying2.address, 3, parseUnits('0.37', 6))
    expect(await underlying2.balanceOf(owner.address)).eq(balUNDERLYING2.sub(parseUnits('0.7', 6)));

    expect(formatUnits(await ve.lockedDerivedAmount(3))).eq('0.84');
    expect(+formatUnits(await ve.balanceOfNFT(3))).above(0.6);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD / 2);

    expect(+formatUnits(await ve.balanceOfNFT(3))).above(0.28); // the actual value is volatile...

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD / 2);

    await ve.withdrawAll(3);

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
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
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

  it("merge test", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);
    await ve.addToken(underlying2.address, parseUnits('10'));
    await underlying2.mint(owner.address, parseUnits('100', 6));
    await underlying2.approve(ve.address, Misc.MAX_UINT);
    await ve.increaseAmount(underlying2.address, 1, parseUnits('1', 6))

    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

    const lock3 = await ve.lockedEnd(3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1.1'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(parseUnits('1', 6));
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('1'));

    await ve.merge(1, 3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('2.1'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(0);
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(0);
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('2'));
    expect(await ve.lockedAmounts(3, underlying2.address)).eq(parseUnits('1', 6));
    expect(await ve.lockedEnd(1)).eq(0);
    expect(await ve.lockedEnd(3)).eq(lock3);
  });

  it("split test", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);
    await ve.addToken(underlying2.address, parseUnits('10'));
    await underlying2.mint(owner.address, parseUnits('100', 6));
    await underlying2.approve(ve.address, Misc.MAX_UINT);
    await ve.increaseAmount(underlying2.address, 1, parseUnits('1', 6))

    expect(await ve.lockedAmounts(1, tetu.address)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(parseUnits('1', 6));
    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1.1'));

    await ve.split(1, parseUnits('50'));

    const lock3 = await ve.lockedEnd(3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0.55'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('0.55'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(parseUnits('0.5', 6));
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(3, underlying2.address)).eq(parseUnits('0.5', 6));

    await ve.merge(1, 3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('1.1'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(0);
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(0);
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(3, underlying2.address)).eq(parseUnits('1', 6));
    expect(await ve.lockedEnd(1)).eq(0);
    expect(await ve.lockedEnd(3)).eq(lock3);
  });

  it("split without 2 und test", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);
    await ve.addToken(underlying2.address, parseUnits('10'));


    expect(await ve.lockedAmounts(1, tetu.address)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(0);
    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1'));

    await ve.split(1, parseUnits('50'));

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0.5'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(0);
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(3, underlying2.address)).eq(0);
  });

  it("merge without und2 test", async function () {
    await ve.announceAction(1);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);
    await ve.addToken(underlying2.address, parseUnits('10'));

    await ve.createLock(tetu.address, parseUnits('1'), LOCK_PERIOD);

    const lock3 = await ve.lockedEnd(3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(0);
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('1'));

    await ve.merge(1, 3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('2'));
    expect(await ve.lockedAmounts(1, tetu.address)).eq(0);
    expect(await ve.lockedAmounts(1, underlying2.address)).eq(0);
    expect(await ve.lockedAmounts(3, tetu.address)).eq(parseUnits('2'));
    expect(await ve.lockedAmounts(3, underlying2.address)).eq(0);
    expect(await ve.lockedEnd(1)).eq(0);
    expect(await ve.lockedEnd(3)).eq(lock3);
  });

  it("merge with expired should revert test", async function () {

    await ve.createLock(tetu.address, parseUnits('1'), 60 * 60 * 24 * 14);
    await ve.callStatic.merge(1, 3);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 21)
    await expect(ve.merge(1, 3)).revertedWith('EXPIRED');
  });

  it("create for another should reverted test", async function () {
    await tetu.connect(owner2).approve(ve.address, parseUnits('10000'));
    await tetu.connect(owner3).approve(ve.address, parseUnits('10000'));
    expect((await tetu.balanceOf(owner2.address)).gte(parseUnits('1'))).eq(true);
    await expect(ve.connect(owner3).createLockFor(tetu.address, parseUnits('1'), 60 * 60 * 24 * 14, owner2.address)).revertedWith('ERC20: transfer amount exceeds balance');
  });

  it("always max lock test", async function () {
    await expect(ve.setAlwaysMaxLock(1, false)).revertedWith('WRONG_INPUT');

    const endOld = (await ve.lockedEnd(1)).toNumber()
    const balOld = +formatUnits(await ve.balanceOfNFT(1))
    const supplyOld = +formatUnits(await ve.totalSupply())
    console.log('old', endOld, balOld, supplyOld, new Date(endOld * 1000))

    await ve.setAlwaysMaxLock(1, true);

    expect((await ve.additionalTotalSupply()).toString()).eq(parseUnits('1').toString());

    const endNew = (await ve.lockedEnd(1)).toNumber()
    const balNew = +formatUnits(await ve.balanceOfNFT(1))
    const supplyNew = +formatUnits(await ve.totalSupply())
    console.log('new', endNew, balNew, supplyNew, new Date(endNew * 1000))

    expect(balNew).eq(1);
    expect(endNew).eq(await maxLockTime(ve));

    await ve.setAlwaysMaxLock(1, false);

    console.log('supply after relock', +formatUnits(await ve.totalSupply()))

    expect(+formatUnits(await ve.totalSupply())).approximately(supplyOld, 0.001);
    expect((await ve.additionalTotalSupply()).toString()).eq('0');

    // should be on high level coz we extended time to max lock on disable
    expect(+formatUnits(await ve.balanceOfNFT(1))).gt(1 - 0.05);
    expect((await ve.lockedEnd(1)).toNumber()).eq(await maxLockTime(ve));

    await ve.setAlwaysMaxLock(1, true);

    expect((await ve.additionalTotalSupply()).toString()).eq(parseUnits('1').toString());

    await ve.increaseAmount(tetu.address, 1, parseUnits('1'))

    expect(+formatUnits(await ve.totalSupply())).approximately(supplyOld + 1, 0.1);
    expect((await ve.additionalTotalSupply()).toString()).eq(parseUnits('2').toString());

    await ve.setAlwaysMaxLock(1, false);

    expect((await ve.additionalTotalSupply()).toString()).eq('0');
    expect(+formatUnits(await ve.totalSupply())).approximately(supplyOld + 1, 0.1);

    //// --- after all we should withdraw normally
    await TimeUtils.advanceBlocksOnTs(MAX_LOCK)
    const tetuBal = await tetu.balanceOf(owner.address);
    const amnt = await ve.lockedAmounts(1, tetu.address)
    console.log('amnt', formatUnits(amnt))
    expect(+formatUnits(amnt)).eq(2);
    await ve.withdrawAll(1)
    expect((await tetu.balanceOf(owner.address)).sub(tetuBal).toString()).eq(amnt.toString());
  });

});

async function maxLockTime(ve: VeTetu) {
  const now = (await ve.blockTimestamp()).toNumber()
  return Math.round((now + MAX_LOCK) / WEEK) * WEEK;
}


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
