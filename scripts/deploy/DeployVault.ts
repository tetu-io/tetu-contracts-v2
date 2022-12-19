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
import {PolygonAddresses} from "../addresses/polygon";


const ASSET = "0x078b7c9304eBA754e916016E8A8939527076f991";
const BUFFER = 1000; // 1%
const DEPOSIT_FEE = 300; // 0.3%
const WITHDRAW_FEE = 300; // 0.3%

async function main() {
  const signer = (await ethers.getSigners())[0];
  console.log('signer ', signer.address);
  console.log('network', hre.network.name);

  const core = Addresses.getCore();

  const symbol = await IERC20Metadata__factory.connect(ASSET, signer).symbol();
  const vaultSymbol = "t" + symbol;

  const factory = VaultFactory__factory.connect(core.vaultFactory, signer)

  await RunHelper.runAndWait(() => factory.createVault(
    ASSET,
    'Tetu V2 ' + vaultSymbol,
    vaultSymbol,
    core.gauge,
    BUFFER
  ));
  const l = (await factory.deployedVaultsLength()).toNumber();
  const vault = await factory.deployedVaults(l - 1);
  console.log(l, 'VAULT: ', vault)

  await RunHelper.runAndWait(() => TetuVaultV2__factory.connect(vault, signer).setFees(DEPOSIT_FEE, WITHDRAW_FEE));
  await RunHelper.runAndWait(() => ControllerV2__factory.connect(core.controller, signer).registerVault(vault));
  await RunHelper.runAndWait(() => MultiGauge__factory.connect(core.gauge, signer).addStakingToken(vault));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
