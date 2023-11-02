import hre, {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {ArbitrageVaultPool, IERC20__factory, ITetuLiquidator__factory, TetuVaultV2__factory} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {BaseAddresses} from "../../scripts/addresses/base";
import {TokenUtils} from "../TokenUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";

describe.skip("ArbitrageVaultPoolTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let arb: ArbitrageVaultPool;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    if (hre.network.config.chainId !== 8453) {
      return;
    }
    arb = await DeployerUtils.deployContract(signer, 'ArbitrageVaultPool') as ArbitrageVaultPool;
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


  it("arbitrage", async () => {
    if (hre.network.config.chainId !== 8453) {
      return;
    }

    console.log('pool price before', formatUnits(await arb.poolNormalPrice(BaseAddresses.USDbC_tUSDbC_UNI3_POOL)))

    await TokenUtils.getToken(BaseAddresses.USDbC_TOKEN, signer.address, parseUnits('100000', 6));
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).approve(BaseAddresses.tUSDbC, Misc.MAX_UINT);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('100', 6), arb.address);

    await TimeUtils.advanceNBlocks(10);

    const liquidator = '0x22e2625F9d8c28CB4BcE944E9d64efb4388ea991';

    // await ITetuLiquidator__factory.connect(liquidator, signer).addLargestPools([{
    //   pool: BaseAddresses.USDbC_tUSDbC_UNI3_POOL,
    //   swapper: '',
    //   tokenIn: BaseAddresses.USDbC_TOKEN,
    //   tokenOut: BaseAddresses.tUSDbC,
    // }], false);

    // await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).approve(liquidator, Misc.MAX_UINT);
    // await ITetuLiquidator__factory.connect(liquidator, signer).liquidate(BaseAddresses.USDbC_TOKEN, BaseAddresses.tUSDbC, parseUnits('1000', 6), signer.address);
    // console.log('pool price after swap', formatUnits(await arb.poolNormalPrice(BaseAddresses.USDbC_tUSDbC_UNI3_POOL)))

    await arb.arbitrageUni3WithVault(BaseAddresses.USDbC_tUSDbC_UNI3_POOL, BaseAddresses.tUSDbC);

    console.log('pool price end', formatUnits(await arb.poolNormalPrice(BaseAddresses.USDbC_tUSDbC_UNI3_POOL)))
  });


})
