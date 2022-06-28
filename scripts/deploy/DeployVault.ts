import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {VaultFactory__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


const ASSET = '0x57D3e8CA53878d6Aa8B1c48Bd8F3e52a3bCeC005';
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
