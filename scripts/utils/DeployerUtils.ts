import {ethers, web3} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumberish, ContractFactory, utils} from "ethers";
import {Misc} from "./Misc";
import logSettings from "../../log_settings";
import {Logger} from "tslog";
import {Libraries} from "hardhat-deploy/dist/types";
import {parseUnits} from "ethers/lib/utils";
import {
  ControllerMinimal, ForwarderV3, ForwarderV3__factory,
  MockStakingToken,
  MockToken,
  MockVault,
  MockVault__factory,
  MockVoter,
  MultiBribe__factory,
  MultiGauge__factory,
  ProxyControlled,
  StrategySplitterV2,
  StrategySplitterV2__factory,
  TetuVaultV2,
  TetuVaultV2__factory,
  TetuVoter,
  TetuVoter__factory,
  VaultInsurance,
  VeDistributor__factory,
  VeTetu,
  VeTetu__factory
} from "../../typechain";
import {VerifyUtils} from "./VerifyUtils";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");
const log: Logger = new Logger(logSettings);


const libraries = new Map<string, string>([
  ['VeTetu', 'VeTetuLogo']
]);

export class DeployerUtils {

  // ************ CONTRACT DEPLOY **************************

  public static async deployContract<T extends ContractFactory>(
    signer: SignerWithAddress,
    name: string,
    // tslint:disable-next-line:no-any
    ...args: any[]
  ) {
    log.info(`Deploying ${name}`);
    log.info("Account balance: " + utils.formatUnits(await signer.getBalance(), 18));

    const gasPrice = await web3.eth.getGasPrice();
    log.info("Gas price: " + gasPrice);
    const lib: string | undefined = libraries.get(name);
    let _factory;
    if (lib) {
      log.info('DEPLOY LIBRARY', lib, 'for', name);
      const libAddress = (await DeployerUtils.deployContract(signer, lib)).address;
      const librariesObj: Libraries = {};
      librariesObj[lib] = libAddress;
      _factory = (await ethers.getContractFactory(
        name,
        {
          signer,
          libraries: librariesObj
        }
      )) as T;
    } else {
      _factory = (await ethers.getContractFactory(
        name,
        signer
      )) as T;
    }
    let gas = 19_000_000;
    if (hre.network.name === 'hardhat') {
      gas = 999_999_999;
    }
    const instance = await _factory.deploy(...args, {gasLimit: gas});
    log.info('Deploy tx:', instance.deployTransaction.hash);
    await instance.deployed();

    const receipt = await ethers.provider.getTransactionReceipt(instance.deployTransaction.hash);
    console.log('DEPLOYED: ', name, receipt.contractAddress);

    if (hre.network.name !== 'hardhat') {
      await Misc.wait(10);
      if (args.length === 0) {
        await VerifyUtils.verify(receipt.contractAddress);
      } else {
        await VerifyUtils.verifyWithArgs(receipt.contractAddress, args);
        if (name === 'ProxyControlled') {
          await VerifyUtils.verifyProxy(receipt.contractAddress);
        }
      }
    }
    return _factory.attach(receipt.contractAddress);
  }

  public static async deployMockToken(signer: SignerWithAddress, name = 'MOCK', decimals = 18) {
    const token = await DeployerUtils.deployContract(signer, 'MockToken', name + '_MOCK_TOKEN', name, decimals) as MockToken;
    await token.mint(signer.address, parseUnits('1000000', decimals));
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
    await proxy.initProxy(logic.address);
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

  public static async deployVeTetu(signer: SignerWithAddress, token: string, controller: string) {
    const logic = await DeployerUtils.deployContract(signer, 'VeTetu');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    await VeTetu__factory.connect(proxy.address, signer).init(
      token,
      controller
    )
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
    await proxy.initProxy(logic.address);
    await TetuVoter__factory.connect(proxy.address, signer).init(
      controller,
      ve,
      rewardToken,
      gauge,
      bribe,
    );
    return TetuVoter__factory.connect(proxy.address, signer);
  }

  public static async deployMultiGauge(
    signer: SignerWithAddress,
    controller: string,
    operator: string,
    ve: string,
    defaultRewardToken: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'MultiGauge');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    await MultiGauge__factory.connect(proxy.address, signer).init(
      controller,
      operator,
      ve,
      defaultRewardToken,
    );
    return MultiGauge__factory.connect(proxy.address, signer);
  }

  public static async deployMultiBribe(
    signer: SignerWithAddress,
    controller: string,
    operator: string,
    ve: string,
    defaultReward: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'MultiBribe');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    await MultiBribe__factory.connect(proxy.address, signer).init(
      controller,
      operator,
      ve,
      defaultReward
    );
    return MultiBribe__factory.connect(proxy.address, signer);
  }

  public static async deployMockVoter(signer: SignerWithAddress, ve: string) {
    return await DeployerUtils.deployContract(signer, 'MockVoter', ve) as MockVoter;
  }

  public static async deployVeDistributor(
    signer: SignerWithAddress,
    controller: string,
    ve: string,
    rewardToken: string,
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'VeDistributor');
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    await VeDistributor__factory.connect(proxy.address, signer).init(
      controller,
      ve,
      rewardToken
    );
    return VeDistributor__factory.connect(proxy.address, signer);
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
    tetu: string
  ) {
    const logic = await DeployerUtils.deployContract(signer, 'ForwarderV3') as ForwarderV3;
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled') as ProxyControlled;
    await proxy.initProxy(logic.address);
    const forwarder = ForwarderV3__factory.connect(proxy.address, signer);
    await forwarder.init(
      controller,
      tetu
    );
    return forwarder;
  }

}
