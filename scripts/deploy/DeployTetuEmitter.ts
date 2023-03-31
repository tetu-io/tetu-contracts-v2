import {ethers} from "hardhat";
import {DeployerUtils} from "../utils/DeployerUtils";
import {Addresses} from "../addresses/addresses";
import {PolygonAddresses} from "../addresses/polygon";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = Addresses.getCore();
  const ctr = await DeployerUtils.deployTetuEmitter(signer, core.controller, PolygonAddresses.TETU_TOKEN, core.bribe)
  console.log("Emitter deployed to:", ctr.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
