import hre, {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {ArbitrageVaultSolidly, IERC20__factory, ISolidlyPair__factory, TetuVaultV2__factory} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {BaseAddresses} from "../../scripts/addresses/base";
import {TokenUtils} from "../TokenUtils";
import {parseUnits} from "ethers/lib/utils";
import {Misc} from "../../scripts/utils/Misc";

describe("ArbitrageVaultSolidlyTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let arb: ArbitrageVaultSolidly;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();
    if (hre.network.config.chainId !== 8453) {
      return;
    }
    arb = await DeployerUtils.deployContract(signer, 'ArbitrageVaultSolidly') as ArbitrageVaultSolidly;
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


  it("arbitrage expensive vault shares", async () => {
    if (hre.network.config.chainId !== 8453) {
      return;
    }

    await TokenUtils.getToken(BaseAddresses.USDbC_TOKEN, signer.address, parseUnits('100000', 6));
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).approve(BaseAddresses.tUSDbC, Misc.MAX_UINT);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('20000', 6), arb.address);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('10000', 6), BaseAddresses.USDbC_tUSDbC_AERODROME_LP);
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).transfer(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, parseUnits('10000', 6));
    await ISolidlyPair__factory.connect(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, signer).sync();

    await TimeUtils.advanceNBlocks(10);

    const amount = parseUnits('10000', 6)
    const amountOut = await ISolidlyPair__factory.connect(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, signer).getAmountOut(amount, BaseAddresses.USDbC_TOKEN);
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).transfer(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, amount);
    await ISolidlyPair__factory.connect(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, signer).swap(amountOut, 0, signer.address, '0x');

    await arb.arbitrage(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, BaseAddresses.tUSDbC);
  });


  it("arbitrage cheap vault shares", async () => {
    if (hre.network.config.chainId !== 8453) {
      return;
    }

    await TokenUtils.getToken(BaseAddresses.USDbC_TOKEN, signer.address, parseUnits('100000', 6));
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).approve(BaseAddresses.tUSDbC, Misc.MAX_UINT);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('20000', 6), arb.address);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('13000', 6), signer.address);
    await TetuVaultV2__factory.connect(BaseAddresses.tUSDbC, signer).deposit(parseUnits('10000', 6), BaseAddresses.USDbC_tUSDbC_AERODROME_LP);
    await IERC20__factory.connect(BaseAddresses.USDbC_TOKEN, signer).transfer(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, parseUnits('10000', 6));

    await TimeUtils.advanceNBlocks(10);

    const amount = parseUnits('10000', 6)
    const amountOut = await ISolidlyPair__factory.connect(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, signer).getAmountOut(amount, BaseAddresses.tUSDbC);
    await IERC20__factory.connect(BaseAddresses.tUSDbC, signer).transfer(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, amount);
    await ISolidlyPair__factory.connect(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, signer).swap(0, amountOut, signer.address, '0x');

    await arb.arbitrage(BaseAddresses.USDbC_tUSDbC_AERODROME_LP, BaseAddresses.tUSDbC);
  });


})
