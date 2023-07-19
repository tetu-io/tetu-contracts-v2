import {ethers} from "hardhat";
import {Addresses} from "../addresses/addresses";
import {PlatformVoter__factory} from "../../typechain";
import {RunHelper} from "../utils/RunHelper";

// tslint:disable-next-line:no-var-requires
const {request, gql} = require('graphql-request')

async function main() {
  const [signer] = await ethers.getSigners();
  const core = Addresses.getCore();

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
    console.log(new Date(vote.date * 1000), 'value: ', vote.newValue, 'power: ', Number(vote.vePower).toFixed(), 've: ', vote.veNFT.veNFTId);
    const md = minDate.get(+vote.veNFT.veNFTId) ?? Date.now();
    if (md > +vote.date) {
      minDate.set(+vote.veNFT.veNFTId, +vote.date);
    }
  }

  console.log('total ve voted', minDate.size);

  const vePokes: number[] = [];
  for (const [veId, md] of minDate.entries()) {
    console.log('ve: ', veId, 'min date: ', new Date(md * 1000));
    const time = Date.now() - 60 * 60 * 24 * 21 * 1000;
    if (md * 1000 < time) {
      vePokes.push(veId);
    }
  }

  console.log('total ve pokes', vePokes.length);

  for (const veId of vePokes) {
    console.log('poke ve: ', veId);
    // await RunHelper.runAndWait(() => voter.poke(veId));
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
