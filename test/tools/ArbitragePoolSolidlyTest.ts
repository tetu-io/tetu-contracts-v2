import hre, {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {ArbitragePoolSolidly, IERC20__factory, ISolidlyPair__factory, TetuVaultV2__factory} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {BaseAddresses} from "../../scripts/addresses/base";
import {TokenUtils} from "../TokenUtils";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";

describe("ArbitragePoolSolidlyTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let arb: ArbitragePoolSolidly;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    if (hre.network.config.chainId !== 8453) {
      return;
    }
    arb = await DeployerUtils.deployContract(signer, 'ArbitragePoolSolidly') as ArbitragePoolSolidly;
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


  it("arbitrage test", async () => {
    if (hre.network.config.chainId !== 8453) {
      return;
    }

    const token0 = BaseAddresses.TETU_TOKEN;
    const token1 = BaseAddresses.tUSDbC;
    const pool = BaseAddresses.TETU_tUSDbC_AERODROME_LP;

    await TokenUtils.getToken(BaseAddresses.USDbC_TOKEN, signer.address, parseUnits('100000', 6));
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).approve(BaseAddresses.tUSDbC, Misc.MAX_UINT);
    // await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('20000', 6), pool);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('20000', 6), arb.address);
    // await TokenUtils.getToken(token0, pool, parseUnits('1000000'));
    // await ISolidlyPair__factory.connect(pool, signer).swap(parseUnits('1', 6), 0, signer.address, '0x');

    const rr = await ISolidlyPair__factory.connect(pool, signer).getReserves();
    console.log('r0', rr[0].toString())
    console.log('r1', rr[1].toString())

    // await TokenUtils.getToken(token0, signer.address, parseUnits('1000'));
    // await TokenUtils.getToken(token1, signer.address, parseUnits('1000', 6));

    await TokenUtils.getToken(token0, arb.address, parseUnits('100000'));



    await arb.arbitrage(pool, '5575');

    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', formatUnits(await arb.getCurrentPrice(pool), 6))

    await arb.arbitrage(pool, '9999');

    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', formatUnits(await arb.getCurrentPrice(pool), 6))

    await arb.arbitrage(pool, '3000');

    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', formatUnits(await arb.getCurrentPrice(pool), 6))

    await arb.arbitrage(pool, '15000');

    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', formatUnits(await arb.getCurrentPrice(pool), 6))

    await arb.arbitrage(pool, '15000');
  });


})
