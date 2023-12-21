import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {InvestFundV2__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";
import {Addresses} from "../addresses/addresses";
import {Misc} from "../utils/Misc";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const tools = Addresses.getTools();

  const tetu = core.tetu;
  const controller = await DeployerUtils.deployController(signer);
  const gauge = await DeployerUtils.deployMultiGaugeNoBoost(signer, controller.address, tetu);
  const tetuVoter = await DeployerUtils.deployTetuVoterSimplified(signer, controller.address, tetu, gauge.address);
  const forwarder = await DeployerUtils.deployForwarderSimplified(signer, controller.address, tetu);
  const fundAdr = await DeployerUtils.deployProxy(signer, 'InvestFundV2');
  const investFund = InvestFundV2__factory.connect(fundAdr, signer);
  await RunHelper.runAndWait2(investFund.populateTransaction.init(controller.address));

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

  await RunHelper.runAndWait2(controller.populateTransaction.announceAddressChange(2, tetuVoter.address));
  await RunHelper.runAndWait2(controller.populateTransaction.announceAddressChange(4, tools.liquidator));
  await RunHelper.runAndWait2(controller.populateTransaction.announceAddressChange(5, forwarder.address));
  await RunHelper.runAndWait2(controller.populateTransaction.announceAddressChange(6, fundAdr));


  await RunHelper.runAndWait2(controller.populateTransaction.changeAddress(2)); // TETU_VOTER
  await RunHelper.runAndWait2(controller.populateTransaction.changeAddress(4)); // LIQUIDATOR
  await RunHelper.runAndWait2(controller.populateTransaction.changeAddress(5)); // FORWARDER
  await RunHelper.runAndWait2(controller.populateTransaction.changeAddress(6)); // INVEST_FUND

  const result = `  public static CORE_ADDRESSES = new CoreAddresses(
    "${tetu}", // tetu
    "${controller.address}", // controller
    "${Misc.ZERO_ADDRESS}", // ve
    "${Misc.ZERO_ADDRESS}", // veDist
    "${gauge.address}", // gauge
    "${Misc.ZERO_ADDRESS}", // bribe
    "${tetuVoter.address}", // tetuVoter
    "${Misc.ZERO_ADDRESS}", // platformVoter
    "${forwarder.address}", // forwarder
    "${vaultFactory.address}", // vaultFactory
    "${investFund.address}", // investFund
  );`

  DeployerUtils.createFolderAndWriteFileSync('tmp/deployed/core.txt', result);
}

main()
  .then(() => {
    console.log('Script finished successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
