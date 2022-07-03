import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {ControllerV2__factory, MultiGauge__factory, VaultFactory__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


const ASSET = '0xcb7ecc5f81d90de6ddb1071daa48d5b4c4f7ed2f';
const NAME = 'tetuWETH';
const BUFFER = 100;

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const factory = VaultFactory__factory.connect(core.vaultFactory, signer)

  await RunHelper.runAndWait(() => factory.createVault(
    ASSET,
    NAME,
    NAME,
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
