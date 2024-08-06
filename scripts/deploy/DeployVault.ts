import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {
  ControllerV2__factory,
  IERC20Metadata__factory,
  MultiGauge__factory,
  TetuVaultV2__factory,
  VaultFactory__factory
} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";
import {BaseAddresses} from "../addresses/base";
import {ZkEvmAddresses} from "../addresses/zkevm";


const ASSET = ZkEvmAddresses.USDC_TOKEN;
const BUFFER = 1000; // 1%
const DEPOSIT_FEE = 300; // 0.3%
const WITHDRAW_FEE = 300; // 0.3%

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const symbol = await IERC20Metadata__factory.connect(ASSET, signer).symbol();
  const vaultSymbol = "t" + symbol;

  const factory = VaultFactory__factory.connect(core.vaultFactory, signer)

  await RunHelper.runAndWait2(factory.populateTransaction.createVault(
    ASSET,
    'Tetu V2 ' + vaultSymbol,
    vaultSymbol,
    core.gauge,
    BUFFER
  ));
  const l = (await factory.deployedVaultsLength()).toNumber();
  const vault = await factory.deployedVaults(l - 1);
  console.log(l, 'VAULT: ', vault)

  await RunHelper.runAndWait2(ControllerV2__factory.connect(core.controller, signer).populateTransaction.registerVault(vault));
  await RunHelper.runAndWait2(MultiGauge__factory.connect(core.gauge, signer).populateTransaction.addStakingToken(vault));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
