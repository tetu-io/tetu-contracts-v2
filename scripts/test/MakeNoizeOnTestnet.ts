import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {
  ControllerV2__factory,
  IERC20__factory,
  InvestFundV2__factory,
  MultiBribe__factory,
  MultiGauge__factory, StakelessMultiPoolBase__factory
} from "../../typechain";
import {Addresses} from "../addresses/addresses";
import {parseUnits} from "ethers/lib/utils";
import {RunHelper} from "../utils/RunHelper";
import {Misc} from "../utils/Misc";
import {Signer} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const USDC = '0x308A756B4f9aa3148CaD7ccf8e72c18C758b2EF2';
const BTC = '0x27af55366a339393865FC5943C04bc2600F55C9F';
const WETH = '0xbf1e638871c59859db851674c7f94efcb0f40954';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const vaults = await ControllerV2__factory.connect(core.controller, signer).vaultsList();

  const bribe = MultiBribe__factory.connect(core.bribe, signer);
  const gauge = MultiGauge__factory.connect(core.gauge, signer);

  for (const vault of vaults) {

    await registerTokenIfnOtExist(signer, gauge.address, vault, USDC);
    // await RunHelper.runAndWait(() => gauge.notifyRewardAmount(vault, USDC, parseUnits('1', 6)));

    await registerTokenIfnOtExist(signer, bribe.address, vault, WETH);
    await RunHelper.runAndWait(() => bribe.notifyRewardAmount(vault, WETH, parseUnits('1')))


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
