import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ContractFactory} from "ethers";
import logSettings from "../../log_settings";
import {Logger} from "tslog";
import {parseUnits} from "ethers/lib/utils";
import {
  ControllerMinimal,
  ControllerV2,
  ControllerV2__factory,
  ForwarderV3,
  ForwarderV3__factory,
  ForwarderV4,
  ForwarderV4__factory,
  MockStakingToken,
  MockToken,
  MockVault,
  MockVault__factory,
  MockVoter,
  MultiBribe__factory,
  MultiGauge__factory,
  MultiGaugeNoBoost__factory,
  PlatformVoter,
  PlatformVoter__factory,
  ProxyControlled,
  StrategySplitterV2,
  StrategySplitterV2__factory,
  TetuEmitter__factory,
  TetuVaultV2,
  TetuVaultV2__factory,
  TetuVoter,
  TetuVoter__factory,
  TetuVoterSimplified__factory,
  VaultFactory,
  VaultInsurance,
  VeTetu,
  VeTetu__factory
} from "../../typechain";
import {RunHelper} from "./RunHelper";
import {deployContract} from "../deploy/DeployContract";
import {mkdirSync, writeFileSync} from "fs";
import path from "path";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");
const log: Logger<unknown> = new Logger(logSettings);


export class DeployerUtils {

  // ************ CONTRACT DEPLOY **************************

  public static async deployContract<T extends ContractFactory>(
    signer: SignerWithAddress,
    name: string,
    // tslint:disable-next-line:no-any
    ...args: any[]
  ) {
    return deployContract(hre, signer, name, ...args);
  }

  public static async deployMockToken(signer: SignerWithAddress, name = 'MOCK', decimals = 18, premint = true) {
    const token = await DeployerUtils.deployContract(signer, 'MockToken', name + '_MOCK_TOKEN', name, decimals) as MockToken;
    if (premint) {
      await RunHelper.runAndWait2ExplicitSigner(signer, token.populateTransaction.mint(signer.address, parseUnits('1000000', decimals)));
    }
    return token;
  }

  public static async deployMockStakingToken(signer: SignerWithAddress, gauge: string, name = 'MOCK', decimals = 18) {
    return await DeployerUtils.deployContract(signer, 'MockStakingToken', name + '_MOCK_TOKEN', name, decimals, gauge) as MockStakingToken;
  }

  public static async deployMockController(signer: SignerWithAddress) {
    return await DeployerUtils.deployContract(signer, 'ControllerMinimal', signer.address) as ControllerMinimal;
  }

  public static async deployProxy(signer: SignerWithAddress, contract: string) {
    const logic = await DeployerUtils.deployContract(signer, contract);
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    return proxy.address;
  }

  public static async deployMockVault(
    signer: SignerWithAddress,
    controller: string,
    asset: string,
    name: string,
    strategy: string,
    fee: number
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'MockVault') as MockVault;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const vault = MockVault__factory.connect(proxy.address, signer);
    await vault.init(
      controller,
      asset,
      name + '_MOCK_VAULT',
      'x' + name,
      strategy,
      fee,
      {
        gasLimit: 9_000_000
      }
    )
    return vault;
  }

  public static async deployVeTetu(signer: SignerWithAddress, token: string, controller: string, weight = parseUnits('100')) {
    const logic = await DeployerUtils.deployContract(signer, 'VeTetu');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    await RunHelper.runAndWait2(VeTetu__factory.connect(proxy.address, signer).populateTransaction.init(
      token,
      weight,
      controller
    ));
    return VeTetu__factory.connect(proxy.address, signer);
  }

  public static async deployTetuVoter(
    signer: SignerWithAddress,
    controller: string,
    ve: string,
    rewardToken: string,
    gauge: string,
    bribe: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'TetuVoter');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    await RunHelper.runAndWait2(TetuVoter__factory.connect(proxy.address, signer).populateTransaction.init(
      controller,
      ve,
      rewardToken,
      gauge,
      bribe,
    ));
    return TetuVoter__factory.connect(proxy.address, signer);
  }

  public static async deployTetuVoterSimplified(
    signer: SignerWithAddress,
    controller: string,
    rewardToken: string,
    gauge: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'TetuVoterSimplified');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    await RunHelper.runAndWait2(TetuVoterSimplified__factory.connect(proxy.address, signer).populateTransaction.init(
      controller,
      rewardToken,
      gauge,
    ));
    return TetuVoterSimplified__factory.connect(proxy.address, signer);
  }

  public static async deployMultiGauge(
    signer: SignerWithAddress,
    controller: string,
    ve: string,
    defaultRewardToken: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'MultiGauge');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    await RunHelper.runAndWait2(MultiGauge__factory.connect(proxy.address, signer).populateTransaction.init(
      controller,
      ve,
      defaultRewardToken,
    ));
    return MultiGauge__factory.connect(proxy.address, signer);
  }

  public static async deployMultiGaugeNoBoost(
    signer: SignerWithAddress,
    controller: string,
    defaultRewardToken: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'MultiGaugeNoBoost');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    await RunHelper.runAndWait2(MultiGaugeNoBoost__factory.connect(proxy.address, signer).populateTransaction.init(
      controller,
      defaultRewardToken,
    ));
    return MultiGaugeNoBoost__factory.connect(proxy.address, signer);
  }

  public static async deployMultiBribe(
    signer: SignerWithAddress,
    controller: string,
    ve: string,
    defaultReward: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'MultiBribe');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    await RunHelper.runAndWait2(MultiBribe__factory.connect(proxy.address, signer).populateTransaction.init(
      controller,
      ve,
      defaultReward
    ));
    return MultiBribe__factory.connect(proxy.address, signer);
  }

  public static async deployMockVoter(signer: SignerWithAddress, ve: string) {
    return await DeployerUtils.deployContract(signer, 'MockVoter', ve) as MockVoter;
  }

  public static async deployTetuVaultV2(
    signer: SignerWithAddress,
    controller: string,
    asset: string,
    name: string,
    symbol: string,
    gauge: string,
    buffer: number,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'TetuVaultV2') as TetuVaultV2;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const vault = TetuVaultV2__factory.connect(proxy.address, signer);
    await vault.init(
      controller,
      asset,
      name,
      symbol,
      gauge,
      buffer,
    );
    const insurance = await DeployerUtils.deployContract(signer, 'VaultInsurance') as VaultInsurance;
    await insurance.init(vault.address, asset);
    await vault.initInsurance(insurance.address);
    return vault;
  }

  public static async deploySplitter(
    signer: SignerWithAddress,
    controller: string,
    asset: string,
    vault: string
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'StrategySplitterV2') as StrategySplitterV2;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const splitter = StrategySplitterV2__factory.connect(proxy.address, signer);
    await splitter.init(
      controller,
      asset,
      vault
    );
    return splitter;
  }

  public static async deployForwarder(
    signer: SignerWithAddress,
    controller: string,
    tetu: string,
    bribe: string
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'ForwarderV3') as ForwarderV3;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    const forwarder = ForwarderV3__factory.connect(proxy.address, signer);
    await RunHelper.runAndWait2(forwarder.populateTransaction.init(
      controller,
      tetu,
      bribe
    ));
    return forwarder;
  }

  public static async deployForwarderSimplified(
    signer: SignerWithAddress,
    controller: string,
    tetu: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'ForwarderV4');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    const forwarder = ForwarderV4__factory.connect(proxy.address, signer);
    await RunHelper.runAndWait2(forwarder.populateTransaction.init(
      controller,
      tetu,
    ));
    return forwarder;
  }

  public static async deployPlatformVoter(
    signer: SignerWithAddress,
    controller: string,
    ve: string
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'PlatformVoter') as PlatformVoter;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    const forwarder = PlatformVoter__factory.connect(proxy.address, signer);
    await RunHelper.runAndWait2(forwarder.populateTransaction.init(
      controller,
      ve
    ));
    return forwarder;
  }

  public static async deployController(signer: SignerWithAddress) {
    const logic = await DeployerUtils.deployContract(signer, 'ControllerV2') as ControllerV2;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await RunHelper.runAndWait2(proxy.populateTransaction.initProxy(logic.address));
    const controller = ControllerV2__factory.connect(proxy.address, signer);
    await RunHelper.runAndWait2(controller.populateTransaction.init(signer.address));
    return controller;
  }

  public static async deployVaultFactory(
    signer: SignerWithAddress,
    controller: string,
    vaultImpl: string,
    vaultInsuranceImpl: string,
    splitterImpl: string,
  ) {
    return await DeployerUtils.deployContract(signer, 'VaultFactory',
      controller,
      vaultImpl,
      vaultInsuranceImpl,
      splitterImpl
    ) as VaultFactory;
  }

  public static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static createFolderAndWriteFileSync(targetFile: string, data: string) {
    const dir = path.dirname(targetFile)
    mkdirSync(dir, {recursive: true});
    writeFileSync(targetFile, data, 'utf8');
    console.log('+Data written to', targetFile);
  }

}
