import hre, {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {
  ControllerV2__factory,
  IERC20Metadata__factory,
  MultiGauge__factory, TetuVaultV2__factory,
  VaultFactory__factory
} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";
import {PolygonAddresses} from "../addresses/polygon";
import {parseUnits} from "ethers/lib/utils";
import {TokenUtils} from "../../test/TokenUtils";
import {expect} from "chai";


const ASSET = PolygonAddresses.USDC_TOKEN;
const BUFFER = 100;
const DEPOSIT_FEE = 300; // 0.3%
const WITHDRAW_FEE = 300;

async function main() {
  const signer = (await ethers.getSigners())[0];
  console.log('signer ', signer.address);
  console.log('network', hre.network.name);

  const core = Addresses.getCore();

  const asset = IERC20Metadata__factory.connect(ASSET, signer);
  const symbol = await asset.symbol();
  const vaultName = "tetu" + symbol;
  console.log('vaultName', vaultName);

  const factory = VaultFactory__factory.connect(core.vaultFactory, signer)

  await RunHelper.runAndWait(() => factory.createVault(
    ASSET,
    vaultName,
    vaultName,
    core.gauge,
    BUFFER
  ));
  const l = (await factory.deployedVaultsLength()).toNumber();
  const vaultAddress = await factory.deployedVaults(l - 1);
  console.log(l, 'VAULT: ', vaultAddress)

  console.log('setFees', DEPOSIT_FEE, WITHDRAW_FEE);
  const vault = TetuVaultV2__factory.connect(vaultAddress, signer);
  await RunHelper.runAndWait(() =>
    vault.setFees(DEPOSIT_FEE, WITHDRAW_FEE));

  console.log('registerVault');
  await RunHelper.runAndWait(() =>
    ControllerV2__factory.connect(core.controller, signer).registerVault(vaultAddress));

  console.log('addStakingToken');
  await RunHelper.runAndWait(() =>
    MultiGauge__factory.connect(core.gauge, signer).addStakingToken(vaultAddress));

  console.log('+OK Deploy');

  if (hre.network.name === 'hardhat') {
    console.log('# Mini test');
    const decimals = await IERC20Metadata__factory.connect(ASSET, signer).decimals();
    const balanceBefore = await asset.balanceOf(signer.address);
    const amount = parseUnits('100000', decimals);
    await TokenUtils.getToken(ASSET, signer.address, amount);
    await asset.approve(vault.address, amount);
    console.log('asset.approve');
    await vault.deposit(amount, signer.address);
    console.log('vault.deposit');
    await vault.withdrawAll();
    console.log('vault.withdrawAll');
    const balanceAfter = await asset.balanceOf(signer.address);
    const balance = balanceAfter.sub(balanceBefore);
    const denom = await vault.FEE_DENOMINATOR();
    expect(balance).eq(
      amount
        .mul(denom.sub(DEPOSIT_FEE)).div(denom)
        .mul(denom.sub(WITHDRAW_FEE)).div(denom)
    );
    console.log('+OK Mini test');

  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
