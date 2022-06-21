import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";
import {Addresses} from "../addresses/addresses";
import {VaultFactory__factory} from "../../typechain";


const ASSET = '0x01D0b17AC7B72cD4b051840e27A2134F25C53265';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();

  const factory = VaultFactory__factory.connect(core.vaultFactory, signer)

  await factory.createVault(
    ASSET,
    'tetuUSDC',
    'tetuUSDC',
    core.gauge,
    100
  );
  const l = (await factory.deployedVaultsLength()).toNumber();
  console.log(l, 'VAULT: ', await factory.deployedVaults(l - 1))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
