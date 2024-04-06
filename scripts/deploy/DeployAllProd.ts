import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {InvestFundV2__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";
import {Addresses} from "../addresses/addresses";
import {BigNumber} from "ethers";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const tools = Addresses.getTools();

  const tetu = core.tetu;
  const controller = await DeployerUtils.deployController(signer);
  const ve = await DeployerUtils.deployVeTetu(signer, tetu, controller.address, BigNumber.from(1000));
  const gauge = await DeployerUtils.deployMultiGauge(signer, controller.address, ve.address, tetu);
  const bribe = await DeployerUtils.deployMultiBribe(signer, controller.address, ve.address, tetu);
  const tetuVoter = await DeployerUtils.deployTetuVoter(signer, controller.address, ve.address, tetu, gauge.address, bribe.address);
  const platformVoter = await DeployerUtils.deployPlatformVoter(signer, controller.address, ve.address);
  const forwarder = await DeployerUtils.deployForwarder(signer, controller.address, tetu, bribe.address);
  const fundAdr = await DeployerUtils.deployProxy(signer, 'InvestFundV2');
  const investFund = InvestFundV2__factory.connect(fundAdr, signer);
  await RunHelper.runAndWait(() => investFund.init(controller.address));

  const vaultImpl = await DeployerUtils.deployContract(signer, 'TetuVaultV2');
  const vaultInsuranceImpl = await DeployerUtils.deployContract(signer, 'VaultInsurance');
  const splitterImpl = await DeployerUtils.deployContract(signer, 'StrategySplitterV2');

  const vaultFactory = await DeployerUtils.deployVaultFactory(
    signer,
    controller.address,
    vaultImpl.address,
    vaultInsuranceImpl.address,
    splitterImpl.address,
  );

  await RunHelper.runAndWait(() => controller.announceAddressChange(2, tetuVoter.address)); // TETU_VOTER
  await RunHelper.runAndWait(() => controller.announceAddressChange(3, platformVoter.address)); // PLATFORM_VOTER
  await RunHelper.runAndWait(() => controller.announceAddressChange(4, tools.liquidator)); // PLATFORM_VOTER
  await RunHelper.runAndWait(() => controller.announceAddressChange(5, forwarder.address)); // FORWARDER
  await RunHelper.runAndWait(() => controller.announceAddressChange(6, fundAdr)); // INVEST_FUND
  await RunHelper.runAndWait(() => controller.announceAddressChange(7, signer.address)); // VE_DIST


  await RunHelper.runAndWait(() => controller.changeAddress(2)); // TETU_VOTER
  await RunHelper.runAndWait(() => controller.changeAddress(3)); // PLATFORM_VOTER
  await RunHelper.runAndWait(() => controller.changeAddress(4)); // LIQUIDATOR
  await RunHelper.runAndWait(() => controller.changeAddress(5)); // FORWARDER
  await RunHelper.runAndWait(() => controller.changeAddress(6)); // INVEST_FUND
  await RunHelper.runAndWait(() => controller.changeAddress(7)); // VE_DIST

  const result = `  public static CORE_ADDRESSES = new CoreAddresses(
    "${tetu}", // tetu
    "${controller.address}", // controller
    "${ve.address}", // ve
    "${signer.address}", // veDist
    "${gauge.address}", // gauge
    "${bribe.address}", // bribe
    "${tetuVoter.address}", // tetuVoter
    "${platformVoter.address}", // platformVoter
    "${forwarder.address}", // forwarder
    "${vaultFactory.address}", // vaultFactory
    "${investFund.address}", // investFund
  );`

  DeployerUtils.createFolderAndWriteFileSync('tmp/deployed/core.txt', result);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
