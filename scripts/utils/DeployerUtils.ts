import {ethers, web3} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ContractFactory, utils} from "ethers";
import {Misc} from "./Misc";
import logSettings from "../../log_settings";
import {Logger} from "tslog";
import {Libraries} from "hardhat-deploy/dist/types";
import {parseUnits} from "ethers/lib/utils";
import {
  ControllerMinimal,
  MockToken,
  MockVault,
  MockVault__factory,
  ProxyControlled
} from "../../typechain";
import {VerifyUtils} from "./VerifyUtils";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");
const log: Logger = new Logger(logSettings);


const libraries = new Map<string, string>([]);

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
    const instance = await _factory.deploy(...args, {gasLimit: 19_000_000});
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

  public static async deployMockController(signer: SignerWithAddress) {
    return await DeployerUtils.deployContract(signer, 'ControllerMinimal', signer.address) as ControllerMinimal;
  }

  public static async deployProxy(signer: SignerWithAddress, contract: string) {
    const logic = await DeployerUtils.deployContract(signer, contract);
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled', logic.address) as ProxyControlled;
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
    const proxy = await DeployerUtils.deployContract(signer, 'ProxyControlled', logic.address) as ProxyControlled;
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

}
