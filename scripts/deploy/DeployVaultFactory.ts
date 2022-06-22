import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {appendFileSync} from "fs";
import {Addresses} from "../addresses/addresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  await DeployerUtils.deployVaultFactory(
    signer,
    core.controller,
    '0xc3b5d80e4c094b17603ea8bb15d2d31ff5954aae',
    '0xa2c5911b6ecb4da440c93f8b7daa90c68f53e26a',
    '0x6d85966b5280bfbb479e0eba00ac5cedfe8760d3',
    '0x27af55366a339393865fc5943c04bc2600f55c9f',
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
