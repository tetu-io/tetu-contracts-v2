import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {ControllerV2__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";

async function main() {
  const [signer] = await ethers.getSigners();
  const core = Addresses.getCore();
  const toUpdate = await ControllerV2__factory.connect(core.controller, signer).proxyAnnouncesList()


  for (const u of toUpdate) {
    console.log('Update  ', u.proxy, ' to ', u.implementation, new Date(u.timeLockAt.toNumber() * 1000));
  }

  await RunHelper.runAndWait(() => ControllerV2__factory.connect(core.controller, signer)
    .upgradeProxy(
      toUpdate
        .filter(u => u.timeLockAt.toNumber() * 1000 < Date.now())
        .map(u => u.proxy))
  );

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
