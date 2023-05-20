import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {ControllerV2__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";

async function main() {
  const [signer] = await ethers.getSigners();
  const core = Addresses.getCore();
  const toUpdate = await ControllerV2__factory.connect(core.controller, signer).proxyAnnouncesList()

  if (toUpdate.length === 0) {
    return;
  }

  for (const u of toUpdate) {
    console.log('Update  ', u.proxy, ' to ', u.implementation, new Date(u.timeLockAt.toNumber() * 1000));
  }

  const proxiesReadyToUpgrade = toUpdate
    .filter(u => u.timeLockAt.toNumber() * 1000 < Date.now())
    .map(u => u.proxy);

  for (const u of proxiesReadyToUpgrade) {
    console.log('READY to Update  ', u);
  }

  console.log('Ready to Update  ', proxiesReadyToUpgrade);
  if (proxiesReadyToUpgrade.length !== 0) {
    await RunHelper.runAndWait(() => ControllerV2__factory.connect(core.controller, signer).upgradeProxy(proxiesReadyToUpgrade)
    );
  }


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
