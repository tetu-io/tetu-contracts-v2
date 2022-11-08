import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import chai from "chai";
import {parseUnits} from "ethers/lib/utils";
import {MockToken, StakelessMultiPoolMock, StakelessMultiPoolMock__factory} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {Misc} from "../../scripts/utils/Misc";
import {BigNumber} from "ethers";


const {expect} = chai;

const FULL_REWARD = parseUnits('100');

describe("multi pool tests", function () {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let rewarder: SignerWithAddress;

  let wmatic: MockToken;
  let rewardToken: MockToken;
  let rewardToken2: MockToken;
  let rewardTokenDefault: MockToken;
  let pool: StakelessMultiPoolMock;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, user, rewarder] = await ethers.getSigners();

    const controller = await DeployerUtils.deployMockController(owner);
    wmatic = await DeployerUtils.deployMockToken(owner, 'WMATIC', 18);
    await wmatic.mint(owner.address, parseUnits('100'));
    await wmatic.mint(user.address, FULL_REWARD);

    rewardToken = await DeployerUtils.deployMockToken(owner, 'REWARD', 18);
    await rewardToken.mint(rewarder.address, BigNumber.from(Misc.MAX_UINT).sub(parseUnits('1000000')));
    rewardToken2 = await DeployerUtils.deployMockToken(owner, 'REWARD2', 18);
    await rewardToken2.mint(rewarder.address, parseUnits('100'));
    rewardTokenDefault = await DeployerUtils.deployMockToken(owner, 'REWARD_DEFAULT', 18);
    await rewardTokenDefault.mint(rewarder.address, parseUnits('100'));

    const proxy = await DeployerUtils.deployProxy(owner, 'StakelessMultiPoolMock');
    pool = StakelessMultiPoolMock__factory.connect(proxy, owner);
    await pool.init(controller.address, [wmatic.address], rewardTokenDefault.address);

    await wmatic.approve(pool.address, parseUnits('999999999'));
    await wmatic.connect(user).approve(pool.address, parseUnits('999999999'));
    await rewardToken.connect(rewarder).approve(pool.address, Misc.MAX_UINT);
    await rewardToken2.connect(rewarder).approve(pool.address, parseUnits('999999999'));
    await rewardTokenDefault.connect(rewarder).approve(pool.address, parseUnits('999999999'));

    await pool.registerRewardToken(wmatic.address, rewardToken.address);
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


  it("rewardTokensLength test", async function () {
    await pool.registerRewardToken(wmatic.address, rewardToken2.address);
    expect(await pool.rewardTokensLength(wmatic.address)).is.eq(2);
  });


  it("notifyRewardAmount revert for not allowed token test", async function () {
    await expect(pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken2.address, FULL_REWARD)).revertedWith('Token not allowed');
  });

  it("removeRewardToken test", async function () {
    await pool.registerRewardToken(wmatic.address, rewardToken2.address)
    await pool.registerRewardToken(wmatic.address, owner.address)
    await pool.registerRewardToken(wmatic.address, user.address)
    expect(await pool.rewardTokensLength(wmatic.address)).eq(4);
    await pool.removeRewardToken(wmatic.address, rewardToken.address);
    await pool.removeRewardToken(wmatic.address, rewardToken2.address);
    await pool.removeRewardToken(wmatic.address, owner.address);
    await pool.removeRewardToken(wmatic.address, user.address);
    expect(await pool.rewardTokensLength(wmatic.address)).eq(0);
  });

  it("removeRewardToken revert for not finished rewards test", async function () {
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD);
    await expect(pool.connect(user).registerRewardToken(wmatic.address, rewardToken2.address)).revertedWith('Not allowed')
    await pool.registerRewardToken(wmatic.address, rewardToken2.address)
    await expect(pool.registerRewardToken(wmatic.address, rewardToken2.address)).revertedWith('Already registered')
    await pool.registerRewardToken(wmatic.address, owner.address)
    await pool.registerRewardToken(wmatic.address, user.address)
    expect(await pool.rewardTokensLength(wmatic.address)).eq(4);
    await expect(pool.removeRewardToken(wmatic.address, rewardToken.address)).revertedWith('Rewards not ended');
  });

  it("removeRewardToken revert for not registered token test", async function () {
    await expect(pool.removeRewardToken(wmatic.address, rewardToken2.address)).revertedWith('Not reward token');
  });

  it("rewardPerToken test", async function () {
    expect(await pool.rewardPerToken(wmatic.address, Misc.ZERO_ADDRESS)).is.eq(0);
  });

  it("derivedBalance test", async function () {
    expect(await pool.derivedBalance(wmatic.address, Misc.ZERO_ADDRESS)).is.eq(0);
  });

  it("left for empty token test", async function () {
    expect(await pool.left(wmatic.address, Misc.ZERO_ADDRESS)).is.eq(0);
  });

  it("left test", async function () {
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD);
    expect(await pool.left(wmatic.address, rewardToken.address)).is.not.eq(0);
  });

  it("earned test", async function () {
    expect(await pool.earned(wmatic.address, Misc.ZERO_ADDRESS, Misc.ZERO_ADDRESS)).is.eq(0);
  });

  it("getPriorBalanceIndex test", async function () {
    expect(await pool.getPriorBalanceIndex(wmatic.address, Misc.ZERO_ADDRESS, 0)).is.eq(0);
  });

  it("getPriorSupplyIndex test", async function () {
    expect(await pool.getPriorSupplyIndex(wmatic.address, 0)).is.eq(0);
  });

  it("getPriorRewardPerToken test", async function () {
    expect((await pool.getPriorRewardPerToken(wmatic.address, Misc.ZERO_ADDRESS, 0))[0]).is.eq(0);
  });

  it("batchRewardPerToken for empty tokens test", async function () {
    await pool.batchUpdateRewardPerToken(wmatic.address, Misc.ZERO_ADDRESS, 100)
  });

  it("batchRewardPerToken test", async function () {
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.deposit(wmatic.address, parseUnits('1'));
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.withdraw(wmatic.address, parseUnits('1'));
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.deposit(wmatic.address, parseUnits('1'));
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.withdraw(wmatic.address, parseUnits('1'));
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.batchUpdateRewardPerToken(wmatic.address, Misc.ZERO_ADDRESS, 100)
  });

  it("deposit zero amount should be reverted", async function () {
    await expect(pool.deposit(wmatic.address, 0)).revertedWith('Zero amount');
  });

  it("deposit wrong token should be reverted", async function () {
    await expect(pool.deposit(rewardToken.address, 1)).revertedWith("Staking token not allowed");
  });

  it("withdraw wrong token should be reverted", async function () {
    await expect(pool.withdraw(rewardToken.address, 1)).revertedWith("Staking token not allowed");
  });

  it("get rewards not for the owner should be reverted", async function () {
    await expect(pool.getReward(wmatic.address, user.address, [])).revertedWith('Forbidden');
  });

  it("get rewards not for the owner should be reverted", async function () {
    await expect(pool.notifyRewardAmount(wmatic.address, Misc.ZERO_ADDRESS, 0)).revertedWith('Zero amount');
  });

  it("not more than MAX REWARDS TOKENS", async function () {
    let lastRt = null;
    const loops = 9;
    for (let i = 0; i < loops; i++) {
      const rt = await DeployerUtils.deployMockToken(owner, 'RT', 18);
      console.log(i, (await pool.rewardTokensLength(wmatic.address)).toString())
      if (i < loops) {
        await pool.registerRewardToken(wmatic.address, rt.address);
      } else {
        await expect(pool.registerRewardToken(wmatic.address, rt.address)).revertedWith("Too many reward tokens");
      }
      lastRt = rt;
    }
    if (!!lastRt) {
      await expect(pool.registerRewardToken(wmatic.address, lastRt.address)).revertedWith("Too many reward tokens");
    }
    expect(await pool.rewardTokensLength(wmatic.address,)).is.eq(10);
  });

  it("notify checks", async function () {
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));
    // await expect(pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, 10)).revertedWith('Amount should be higher than remaining rewards');
    await expect(pool.connect(rewarder).notifyRewardAmount(wmatic.address, wmatic.address, 10)).revertedWith("Token not allowed");
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, BigNumber.from(Misc.MAX_UINT).div('10000000000000000000'));
  });

  it("notify with default token is fine", async function () {
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardTokenDefault.address, FULL_REWARD.div(4));
  });

  it("too low notify revert", async function () {
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardTokenDefault.address, FULL_REWARD.div(4));
    await expect(pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardTokenDefault.address, 100))
      .revertedWith("Amount should be higher than remaining rewards");
  });

  // ***************** THE MAIN LOGIC TESTS *********************************

  it("update snapshots after full withdraw", async function () {
    await pool.deposit(wmatic.address, parseUnits('0.1'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(10));

    await pool.withdraw(wmatic.address, await pool.balanceOf(wmatic.address, owner.address));

    await pool.deposit(wmatic.address, parseUnits('0.1'));

    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken.address, 200);
  });

  it("deposit and get rewards should receive all amount", async function () {
    await pool.deposit(wmatic.address, parseUnits('1'));
    await pool.withdraw(wmatic.address, parseUnits('1'));
    await pool.deposit(wmatic.address, parseUnits('1'));
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD);
    expect(await rewardToken.balanceOf(pool.address)).is.eq(FULL_REWARD);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365);

    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);
    expect(await rewardToken.balanceOf(pool.address)).is.below(2);
    expect(await rewardToken.balanceOf(owner.address)).is.above(FULL_REWARD.sub(2));
  });

  it("deposit and multiple get rewards should receive all amount", async function () {
    await pool.deposit(wmatic.address, parseUnits('1'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD);
    expect(await rewardToken.balanceOf(pool.address)).is.eq(FULL_REWARD);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);

    expect(await rewardToken.balanceOf(pool.address)).is.below(3);
    expect(await rewardToken.balanceOf(owner.address)).is.above(FULL_REWARD.sub(3));
  });

  it("deposit and get rewards should receive all amount with multiple notify", async function () {
    await pool.deposit(wmatic.address, parseUnits('1'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 6);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 6);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 6);

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 365);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);

    expect(await rewardToken.balanceOf(pool.address)).is.below(4);
    expect(await rewardToken.balanceOf(owner.address)).is.above(FULL_REWARD.sub(4));
  });

  it("multiple deposits and get rewards should receive all amount", async function () {
    await pool.deposit(wmatic.address, parseUnits('0.1'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD);
    expect(await rewardToken.balanceOf(pool.address)).is.eq(FULL_REWARD);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7 - 100);

    for (let i = 0; i < 9; i++) {
      await pool.deposit(wmatic.address, parseUnits('0.1'));
      if (i % 3 === 0) {
        await TimeUtils.advanceBlocksOnTs(10);
      }
    }

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);

    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);
    expect(await rewardToken.balanceOf(pool.address)).is.below(10);
    expect(await rewardToken.balanceOf(owner.address)).is.above(FULL_REWARD.sub(10));
  });

  it("multiple deposit/withdraws and get rewards should receive all amount for multiple accounts", async function () {
    await pool.deposit(wmatic.address, parseUnits('0.5'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));

    // *** DEPOSITS / WITHDRAWS ***

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 6);
    await pool.connect(user).deposit(wmatic.address, parseUnits('0.2'));

    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken.address, 200);
    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken2.address, 200);

    await pool.registerRewardToken(wmatic.address, rewardToken2.address);
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken2.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 6);
    await pool.testDoubleDeposit(wmatic.address, parseUnits('0.5'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 6);
    await pool.connect(user).testDoubleWithdraw(wmatic.address, parseUnits('0.2'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken2.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 6);
    await pool.connect(user).testDoubleDeposit(wmatic.address, parseUnits('0.2'));

    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken.address, 200);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 6);
    await pool.connect(user).deposit(wmatic.address, parseUnits('0.2'));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 6);
    await pool.connect(user).testDoubleWithdraw(wmatic.address, parseUnits('0.2'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));
    await TimeUtils.advanceBlocksOnTs(1);
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken2.address, FULL_REWARD.div(4));

    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken.address, 1);
    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken2.address, 1);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 6);
    await pool.connect(user).withdraw(wmatic.address, parseUnits('0.2'));

    await TimeUtils.advanceBlocksOnTs(60 * 60);
    await pool.connect(user).deposit(wmatic.address, parseUnits('1'));

    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken.address, FULL_REWARD.div(4));
    await pool.connect(rewarder).notifyRewardAmount(wmatic.address, rewardToken2.address, FULL_REWARD.div(4));

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 6);
    await pool.deposit(wmatic.address, parseUnits('0.5'));

    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken2.address, 0);

    // *** GET REWARDS ***

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365);
    await pool.getReward(wmatic.address, owner.address, [rewardToken.address]);
    await pool.getReward(wmatic.address, owner.address, [rewardToken2.address]);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24);
    await pool.connect(user).getReward(wmatic.address, user.address, [rewardToken.address, rewardToken2.address]);

    // each operation can lead to rounding, a gap depends on deposit/withdraw counts and can not be predicted
    expect(await rewardToken.balanceOf(pool.address)).is.below(14);
    expect((await rewardToken.balanceOf(owner.address)).add(await rewardToken.balanceOf(user.address))).is.above(FULL_REWARD.sub(14));

    expect(await rewardToken2.balanceOf(pool.address)).is.below(14);
    expect((await rewardToken2.balanceOf(owner.address)).add(await rewardToken2.balanceOf(user.address))).is.above(FULL_REWARD.sub(14));

    await pool.withdraw(wmatic.address, parseUnits('1'));
    await pool.deposit(wmatic.address, parseUnits('1'));

    await pool.batchUpdateRewardPerToken(wmatic.address, rewardToken.address, 200);
  });

});
