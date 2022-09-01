import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {
  ControllerV2__factory,
  IERC20Metadata__factory,
  MultiGauge__factory,
  VaultFactory__factory
} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


const TOKEN0 = '0x88a12B7b6525c0B46c0c200405f49cE0E72D71Aa';
const TOKEN1 = '0x27af55366a339393865FC5943C04bc2600F55C9F';
const FACTORY = '0xB6Ca119F30B3E7F6589F8a053c2a10B753846e78';

async function main() {
  const signer = (await ethers.getSigners())[0];

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
