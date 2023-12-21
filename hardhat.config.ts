import {config as dotEnvConfig} from "dotenv";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-solhint";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "solidity-coverage"
import "hardhat-abi-exporter"
import {task} from "hardhat/config";
import {deployContract} from "./scripts/deploy/DeployContract";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    hardhatChainId: {
      type: "number",
      default: 31337
    },
    maticRpcUrl: {
      type: "string",
    },
    ethRpcUrl: {
      type: "string",
      default: ''
    },
    sepoliaRpcUrl: {
      type: "string",
      default: ''
    },
    bscRpcUrl: {
      type: "string",
      default: 'https://rpc.ankr.com/bsc'
    },
    baseRpcUrl: {
      type: "string",
    },
    networkScanKey: {
      type: "string",
    },
    networkScanKeyMatic: {
      type: "string",
    },
    networkScanKeyBase: {
      type: "string",
    },
    networkScanKeyBsc: {
      type: "string",
    },
    networkScanKeyZkevm: {
      type: "string",
    },
    privateKey: {
      type: "string",
      default: "85bb5fa78d5c4ed1fde856e9d0d1fe19973d7a79ce9ed6c0358ee06a4550504e" // random account
    },
    ethForkBlock: {
      type: "number",
      default: 0
    },
    maticForkBlock: {
      type: "number",
      default: 0
    },
    baseForkBlock: {
      type: "number",
      default: 0
    },
    zkevmRpcUrl: {
      type: "string",
    },
    zkevmForkBlock: {
      type: "number",
      default: 0
    },
    loggingEnabled: {
      type: "boolean",
      default: false
    },
  }).argv;

task("deploy", "Deploy contract", async function (args, hre, runSuper) {
  const [signer] = await hre.ethers.getSigners();
  // tslint:disable-next-line:ban-ts-ignore
  // @ts-ignore
  await deployContract(hre, signer, args.name)
}).addPositionalParam("name", "Name of the smart contract to deploy");

export default {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: argv.hardhatChainId,
      timeout: 99999999,
      blockGasLimit: 0x1fffffffffffff,
      gas: argv.hardhatChainId === 1 ? 19_000_000 :
        argv.hardhatChainId === 137 ? 19_000_000 :
          argv.hardhatChainId === 8453 ? 19_000_000 :
            9_000_000,
      forking: argv.hardhatChainId !== 31337 ? {
        url:
          argv.hardhatChainId === 1 ? argv.ethRpcUrl :
            argv.hardhatChainId === 137 ? argv.maticRpcUrl :
              argv.hardhatChainId === 8453 ? argv.baseRpcUrl :
                argv.hardhatChainId === 1101 ? argv.zkevmRpcUrl :
                  undefined,
        blockNumber:
          argv.hardhatChainId === 1 ? argv.ethForkBlock !== 0 ? argv.ethForkBlock : undefined :
            argv.hardhatChainId === 137 ? argv.maticForkBlock !== 0 ? argv.maticForkBlock : undefined :
              argv.hardhatChainId === 8453 ? argv.baseForkBlock !== 0 ? argv.baseForkBlock : undefined :
                argv.hardhatChainId === 1101 ? argv.zkevmForkBlock !== 0 ? argv.zkevmForkBlock : undefined :
                  undefined
      } : undefined,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        accountsBalance: "100000000000000000000000000000"
      },
      loggingEnabled: argv.loggingEnabled
    },
    matic: {
      url: argv.maticRpcUrl || '',
      timeout: 99999,
      chainId: 137,
      accounts: [argv.privateKey],
    },
    eth: {
      url: argv.ethRpcUrl || '',
      chainId: 1,
      accounts: [argv.privateKey],
    },
    sepolia: {
      url: argv.sepoliaRpcUrl || '',
      chainId: 11155111,
      accounts: [argv.privateKey],
    },
    bsc: {
      url: argv.bscRpcUrl,
      timeout: 99999,
      chainId: 56,
      accounts: [argv.privateKey],
    },
    base: {
      url: argv.baseRpcUrl || '',
      chainId: 8453,
      // gas: 50_000_000_000,
      accounts: [argv.privateKey],
    },
    zkevm: {
      url: argv.zkevmRpcUrl || '',
      chainId: 1101,
      accounts: [argv.privateKey],
      gasPrice: 1000000000,
      verify: {
        etherscan: {
          apiKey: argv.networkScanKeyZkevm
        }
      }
    },
  },
  etherscan: {
    //  https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#multiple-api-keys-and-alternative-block-explorers
    apiKey: {
      mainnet: argv.networkScanKey,
      goerli: argv.networkScanKey,
      sepolia: argv.networkScanKey,
      polygon: argv.networkScanKeyMatic || argv.networkScanKey,
      bsc: argv.networkScanKeyBsc,
      base: argv.networkScanKeyBase,
      zkevm: argv.networkScanKeyZkevm || argv.networkScanKey,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "zkevm",
        chainId: 1101,
        urls: {
          apiURL: "https://api-zkevm.polygonscan.com/api",
          browserURL: "https://zkevm.polygonscan.com/"
        }
      },
    ]
  },
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 150,
          }
        }
      },
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 9999999999
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: false,
    currency: 'USD',
    gasPrice: 21
  },
  typechain: {
    outDir: "typechain",
  },
  abiExporter: {
    path: './abi',
    runOnCompile: false,
    spacing: 2,
    pretty: false,
    flat: true,
  }
};
