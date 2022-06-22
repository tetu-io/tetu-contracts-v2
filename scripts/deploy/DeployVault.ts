import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";
import {Addresses} from "../addresses/addresses";
import {VaultFactory__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


const ASSET = '0x0C27719A3EdC8F3F1E530213c33548456f379892';
const NAME = 'tetuUSDC';
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
  console.log(l, 'VAULT: ', await factory.deployedVaults(l - 1))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
