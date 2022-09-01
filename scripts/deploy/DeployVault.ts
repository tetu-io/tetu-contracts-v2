import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {
  ControllerV2__factory,
  IERC20Metadata__factory,
  MultiGauge__factory,
  VaultFactory__factory
} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


const ASSET = '0x88a12B7b6525c0B46c0c200405f49cE0E72D71Aa';
const BUFFER = 100;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const symbol = await IERC20Metadata__factory.connect(ASSET, signer).symbol();
  const vaultName = "tetu" + symbol;

  const factory = VaultFactory__factory.connect(core.vaultFactory, signer)

  await RunHelper.runAndWait(() => factory.createVault(
    ASSET,
    vaultName,
    vaultName,
    core.gauge,
    BUFFER
  ));
  const l = (await factory.deployedVaultsLength()).toNumber();
  const vault = await factory.deployedVaults(l - 1);
  console.log(l, 'VAULT: ', vault)

  await RunHelper.runAndWait(() => ControllerV2__factory.connect(core.controller, signer).registerVault(vault));
  await RunHelper.runAndWait(() => MultiGauge__factory.connect(core.gauge, signer).addStakingToken(vault));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
