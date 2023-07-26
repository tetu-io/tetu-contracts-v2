import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {ControllerV2__factory, PlatformVoter__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";
import {deployContract, txParams} from "../deploy/DeployContract";
import {Misc} from "../utils/Misc";
import {TimeUtils} from "../../test/TimeUtils";

// tslint:disable-next-line:no-var-requires
const {request, gql} = require('graphql-request')

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const core = Addresses.getCore();

  // const gov = await Misc.impersonate('0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B')
  // const logic = await deployContract(hre, signer, 'PlatformVoter');
  // await ControllerV2__factory.connect(core.controller, gov).announceProxyUpgrade([core.platformVoter], [logic.address]);
  // await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);
  // await ControllerV2__factory.connect(core.controller, gov).upgradeProxy([core.platformVoter]);


  const voter = PlatformVoter__factory.connect(core.platformVoter, signer);

    const data = await request('https://api.thegraph.com/subgraphs/name/tetu-io/tetu-v2', gql`
        query {
            platformVoterEntities {
                votes(first: 1000) {
                    desiredValue
                    date
                    newValue
                    percent
                    target
                    voteType
                    veWeightedValue
                    vePower
                    veNFT {
                        veNFTId
                    }
                }
            }
        }
    `);

  const votes = data.platformVoterEntities[0].votes;

  const minDate = new Map<number, number>()
  for (const vote of votes) {
    const md = minDate.get(+vote.veNFT.veNFTId) ?? Date.now();
    if (md > +vote.date) {
      // console.log(new Date(vote.date * 1000), 'value: ', vote.newValue, 'power: ', Number(vote.vePower).toFixed(), 've: ', vote.veNFT.veNFTId);
      minDate.set(+vote.veNFT.veNFTId, +vote.date);
    }
  }

  console.log('total ve voted', minDate.size);

  const vePokes: number[] = [];
  for (const [veId, md] of minDate.entries()) {
    const time = Date.now() - 60 * 60 * 24 * 21 * 1000;
    if (md * 1000 < time) {
      console.log('ve: ', veId, 'min date: ', new Date(md * 1000));
      vePokes.push(veId);
    }
  }

  console.log('total ve pokes', vePokes.length);

  const skipVe = new Set<number>([]);

  for (const veId of vePokes) {
    console.log('poke ve: ', veId);
    if (skipVe.has(veId)) {
      continue;
    }
    const params = await txParams(hre, ethers.provider);
    // await RunHelper.runAndWait(() => voter.poke(veId, {...params}));
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
