import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {
  ControllerV2__factory,
  IERC20Metadata__factory,
  MultiGauge__factory,
  VaultFactory__factory
} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";


const TOKEN0 = '0x27af55366a339393865FC5943C04bc2600F55C9F';
const TOKEN1 = '0x0ed08c9A2EFa93C4bF3C8878e61D2B6ceD89E9d7';
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
