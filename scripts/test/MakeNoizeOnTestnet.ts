import {ethers} from "hardhat";
import {
  ControllerV2__factory,
  IERC20__factory,
  MultiBribe__factory,
  MultiGauge__factory,
  StakelessMultiPoolBase__factory,
  TetuVoter__factory,
  VeTetu__factory
} from "../../typechain";
import {Addresses} from "../addresses/addresses";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {RunHelper} from "../utils/RunHelper";
import {Misc} from "../utils/Misc";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const USDC = '0x27af55366a339393865FC5943C04bc2600F55C9F';
const BTC = '0x0ed08c9A2EFa93C4bF3C8878e61D2B6ceD89E9d7';
const WETH = '0x078b7c9304eBA754e916016E8A8939527076f991';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const vaults = await ControllerV2__factory.connect(core.controller, signer).vaultsList();

  const bribe = MultiBribe__factory.connect(core.bribe, signer);
  const gauge = MultiGauge__factory.connect(core.gauge, signer);

  for (const vault of vaults) {

    await registerTokenIfnOtExist(signer, gauge.address, vault, USDC);
    const gaugeLeft = await gauge.left(vault, USDC)
    if (gaugeLeft.lt(parseUnits('1', 6))) {
      await RunHelper.runAndWait(() => gauge.notifyRewardAmount(vault, USDC, parseUnits('1', 6)));
    }

    await registerTokenIfnOtExist(signer, bribe.address, vault, WETH);
    const bribeLeft = await bribe.left(vault, WETH)
    if (bribeLeft.lt(parseUnits('1'))) {
      await RunHelper.runAndWait(() => bribe.notifyRewardAmount(vault, WETH, parseUnits('1')))
    }
    const veBalance = await VeTetu__factory.connect(core.ve, signer).balanceOf(signer.address);
    console.log('ve balance', veBalance.toString());
    for (let i = 0; i < veBalance.toNumber(); i++) {
      if (!veBalance.isZero()) {
        const veId = (await VeTetu__factory.connect(core.ve, signer).tokenOfOwnerByIndex(signer.address, i)).toNumber()
        const power = await VeTetu__factory.connect(core.ve, signer).balanceOfNFT(veId)
        console.log('veId', veId, formatUnits(power))
        if (!power.isZero()) {

          const voter = TetuVoter__factory.connect(core.tetuVoter, signer);
          const lastVote = (await voter.lastVote(veId)).toNumber();
          console.log('lastVote', new Date(lastVote * 1000))
          if ((lastVote + 60 * 60 * 24 * 7) < (Date.now() / 1000)) {
            await RunHelper.runAndWait(() => voter.vote(veId, [vault], [100]));
          }
        }
      }
    }
  }

}

async function registerTokenIfnOtExist(signer: SignerWithAddress, pool: string, vault: string, token: string) {
  const poolCtr = StakelessMultiPoolBase__factory.connect(pool, signer);
  const rtLength = (await poolCtr.rewardTokensLength(vault)).toNumber();
  const rts = new Set<string>();
  for (let i = 0; i < rtLength; i++) {
    const rt = await poolCtr.rewardTokens(vault, i);
    rts.add(rt.toLowerCase());
  }
  if (!rts.has(token.toLowerCase())) {
    await RunHelper.runAndWait(() => poolCtr.registerRewardToken(vault, token));
  }

  const allowance = await IERC20__factory.connect(token, signer).allowance(signer.address, pool)
  if (allowance.lt(parseUnits('100'))) {
    await RunHelper.runAndWait(() => IERC20__factory.connect(token, signer).approve(pool, Misc.MAX_UINT));
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
