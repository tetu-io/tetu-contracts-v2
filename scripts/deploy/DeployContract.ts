import {ContractFactory, providers, utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Libraries} from "hardhat-deploy/dist/types";
import {Logger} from "tslog";
import logSettings from "../../log_settings";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";

const log: Logger<unknown> = new Logger(logSettings);

export const WAIT_BLOCKS_BETWEEN_DEPLOY = 5;

const libraries = new Map<string, string>([
  ['VeTetu', 'VeTetuLib'],
  ['MockStrategy', 'StrategyLib'],
  ['MockStrategyV3', 'StrategyLib2'],
  ['StringLibFacade', 'StringLib'],
]);

export async function deployContract<T extends ContractFactory>(
  // tslint:disable-next-line
  hre: any,
  signer: SignerWithAddress,
  name: string,
  // tslint:disable-next-line:no-any
  ...args: any[]
) {
  if (hre.network.name !== 'hardhat') {
    await hre.run("compile")
  }

  const ethers = hre.ethers;
  log.info(`Deploying ${name}`);
  log.info("Account balance: " + utils.formatUnits(await signer.getBalance(), 18));

  const gasPrice = await ethers.provider.getGasPrice();
  log.info("Gas price: " + formatUnits(gasPrice, 9));
  const lib: string | undefined = libraries.get(name);
  let _factory;
  if (lib) {
    log.info('DEPLOY LIBRARY', lib, 'for', name);
    const libAddress = (await deployContract(hre, signer, lib)).address;
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
  let gas = 5_000_000;
  if (hre.network.name === 'hardhat') {
    gas = 999_999_999;
  } else if (hre.network.name === 'mumbai') {
    gas = 5_000_000;
  }

  const instance = await _factory.deploy(...args, {
    // large gas limit is required for npm run coverage
    // see https://github.com/NomicFoundation/hardhat/issues/3121
    gasLimit: hre.network.name === 'hardhat' ? 29_000_000 : undefined,
    ...(await txParams(hre, signer.provider as providers.Provider))
  });

  // const instance = await _factory.deploy(...args);
  log.info('Deploy tx:', instance.deployTransaction.hash);
  await instance.deployed();

  const receipt = await ethers.provider.getTransactionReceipt(instance.deployTransaction.hash);
  console.log('DEPLOYED: ', name, receipt.contractAddress);

  if (hre.network.name !== 'hardhat') {
    await wait(hre, WAIT_BLOCKS_BETWEEN_DEPLOY);
    if (args.length === 0) {
      await verify(hre, receipt.contractAddress);
    } else {
      await verifyWithArgs(hre, receipt.contractAddress, args);
    }
  }
  return _factory.attach(receipt.contractAddress);
}


// tslint:disable-next-line:no-any
async function wait(hre: any, blocks: number) {
  if (hre.network.name === 'hardhat') {
    return;
  }
  const start = hre.ethers.provider.blockNumber;
  while (true) {
    log.info('wait 10sec');
    await delay(10000);
    if (hre.ethers.provider.blockNumber >= start + blocks) {
      break;
    }
  }
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// tslint:disable-next-line:no-any
async function verify(hre: any, address: string) {
  try {
    await hre.run("verify:verify", {
      address
    })
  } catch (e) {
    log.info('error verify ' + e);
  }
}

// tslint:disable-next-line:no-any
async function verifyWithArgs(hre: any, address: string, args: any[]) {
  try {
    await hre.run("verify:verify", {
      address, constructorArguments: args
    })
  } catch (e) {
    log.info('error verify ' + e);
  }
}



export async function txParams(hre: HardhatRuntimeEnvironment, provider: providers.Provider) {
  const feeData = await provider.getFeeData();

  console.log('maxPriorityFeePerGas', formatUnits(feeData.maxPriorityFeePerGas?.toString() ?? '0', 9));
  console.log('maxFeePerGas', formatUnits(feeData.maxFeePerGas?.toString() ?? '0', 9));
  console.log('gas price:', formatUnits(feeData.gasPrice?.toString() ?? '0', 9));

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    const maxPriorityFeePerGas = Math.max(feeData.maxPriorityFeePerGas?.toNumber() ?? 1, feeData.lastBaseFeePerGas?.toNumber() ?? 1);
    const maxFeePerGas = (feeData.maxFeePerGas?.toNumber() ?? 1) * 2;
    return {
      maxPriorityFeePerGas: maxPriorityFeePerGas.toFixed(0),
      maxFeePerGas: maxFeePerGas.toFixed(0),
    };
  } else {
    return {
      gasPrice: ((feeData.gasPrice?.toNumber() ?? 1) * 1.2).toFixed(0),
    };
  }
}
