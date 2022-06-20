import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync, writeFileSync} from "fs";
import {VaultFactory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";

const GOVERNANCE = '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94';
const INVEST_FUND = '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94';

async function main() {
  const signer = (await ethers.getSigners())[0];

  const tetu = await DeployerUtils.deployMockToken(signer, 'TETU');
  const controller = await DeployerUtils.deployController(signer);
  const ve = await DeployerUtils.deployVeTetu(signer, tetu.address, controller.address);
  const veDist = await DeployerUtils.deployVeDistributor(signer, controller.address, ve.address, tetu.address);
  const gauge = await DeployerUtils.deployMultiGauge(signer, controller.address, GOVERNANCE, ve.address, tetu.address);
  const bribe = await DeployerUtils.deployMultiBribe(signer, controller.address, GOVERNANCE, ve.address, tetu.address);
  const tetuVoter = await DeployerUtils.deployTetuVoter(signer, controller.address, ve.address, tetu.address, gauge.address, bribe.address);
  const platformVoter = await DeployerUtils.deployPlatformVoter(signer, controller.address, ve.address);
  const forwarder = await DeployerUtils.deployForwarder(signer, controller.address, tetu.address);

  const proxyImpl = await DeployerUtils.deployContract(signer, 'ProxyControlled');
  const vaultImpl = await DeployerUtils.deployContract(signer, 'TetuVaultV2');
  const vaultInsuranceImpl = await DeployerUtils.deployContract(signer, 'VaultInsurance');
  const splitterImpl = await DeployerUtils.deployContract(signer, 'StrategySplitterV2');

  const vaultFactory = await DeployerUtils.deployVaultFactory(
    signer,
    controller.address,
    proxyImpl.address,
    vaultImpl.address,
    vaultInsuranceImpl.address,
    splitterImpl.address,
  );

  await RunHelper.runAndWait(() => controller.announceAddressChange(2, tetuVoter.address)); // TETU_VOTER
  // await controller.announceAddressChange(3, .address); // VAULT_CONTROLLER
  // await controller.announceAddressChange(4, .address); // LIQUIDATOR
  await RunHelper.runAndWait(() => controller.announceAddressChange(5, forwarder.address)); // FORWARDER
  await RunHelper.runAndWait(() => controller.announceAddressChange(6, INVEST_FUND)); // INVEST_FUND
  await RunHelper.runAndWait(() => controller.announceAddressChange(7, veDist.address)); // VE_DIST
  await RunHelper.runAndWait(() => controller.announceAddressChange(8, platformVoter.address)); // PLATFORM_VOTER

  await RunHelper.runAndWait(() => controller.changeAddress(2)); // TETU_VOTER
  // await controller.changeAddress(3); // VAULT_CONTROLLER
  // await controller.changeAddress(4); // LIQUIDATOR
  await RunHelper.runAndWait(() => controller.changeAddress(5)); // FORWARDER
  await RunHelper.runAndWait(() => controller.changeAddress(6)); // INVEST_FUND
  await RunHelper.runAndWait(() => controller.changeAddress(7)); // VE_DIST
  await RunHelper.runAndWait(() => controller.changeAddress(8)); // PLATFORM_VOTER

  const result = `
  tetu: ${tetu.address}
  controller: ${controller.address}
  ve: ${ve.address}
  veDist: ${veDist.address}
  gauge: ${gauge.address}
  bribe: ${bribe.address}
  tetuVoter: ${tetuVoter.address}
  platformVoter: ${platformVoter.address}
  forwarder: ${forwarder.address}
  vaultFactory: ${vaultFactory.address}
  `;
  writeFileSync('tmp/deployed/core.txt', result, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
