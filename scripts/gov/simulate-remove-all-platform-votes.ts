import {PlatformVoter, PlatformVoter__factory, VeTetu__factory} from "../../typechain";
import {Misc} from "../utils/Misc";
import {Addresses} from "../addresses/addresses";
import {TimeUtils} from "../../test/TimeUtils";
import {BigNumber} from "ethers";

// tslint:disable-next-line:no-var-requires
const {request, gql} = require('graphql-request')

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

async function main() {
  const signer = await Misc.impersonate('0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B')
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

    // before total:  2 0x0000000000000000000000000000000000000000 22309135493267960537693747 2041902115655696862561336030000
// total:  2 0x0000000000000000000000000000000000000000 5113545723033076067993240 435594938160431577170782625000
  const newTotalWeight = BigNumber.from('22309135493267960537693747').sub('5113545723033076067993240');
  const newTotalValues = BigNumber.from('2041902115655696862561336030000').sub('435594938160431577170782625000');
  console.log('set new values', newTotalWeight.toString(), newTotalValues.toString(), 'value: ', newTotalValues.div(newTotalWeight).toString());
  // await voter.emergencyAdjustWeights(2, Misc.ZERO_ADDRESS, newTotalWeight, newTotalValues)

// total:  3 0xa14dea6e48b3187c5e637c88b84d5dfc701edeb7 8330810085607459913799050 416540504280372995689952500000
// total:  3 0xa14dea6e48b3187c5e637c88b84d5dfc701edeb7 8330810085607459913799050 416540504280372995689952500000
//   await voter.emergencyAdjustWeights(3, '0xa14dea6e48b3187c5e637c88b84d5dfc701edeb7', 0, 0);

  await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 14);

  const targets = new Set<string>();
  const veIds = new Set<number>();

  for (const vote of votes) {
    const veId = vote.veNFT.veNFTId;
    // console.log(vote)
    // console.log(new Date(vote.date * 1000), 'value: ', vote.newValue, 'power: ', Number(vote.vePower).toFixed(), 've: ', veId);
    targets.add(vote.target);
    veIds.add(+veId);
  }

  console.log('---------------------------------------------');

  for (const _type of [1, 2, 3]) {
    if (_type === 3) {
      for (const t of targets) {
        await checkW(_type, t, voter);
      }
    } else {
      await checkW(_type, Misc.ZERO_ADDRESS, voter);
    }
  }

  console.log('---------------------------------------------');

  for (const vote of votes) {
    const veId = vote.veNFT.veNFTId;
    const ownerAdr = await VeTetu__factory.connect(core.ve, signer).ownerOf(veId);
    const owner = await Misc.impersonate(ownerAdr)
    await voter.connect(owner).reset(veId, [vote.voteType], [vote.target]);
  }

  for (const veId of veIds) {
    const voted = await voter.veVotesLength(veId);
    if (voted.gt(0)) {

      const vote = await voter.votes(veId, 0);
      console.log('voted, try to reset vote', veId, vote);

      const ownerAdr = await VeTetu__factory.connect(core.ve, signer).ownerOf(veId);
      const owner = await Misc.impersonate(ownerAdr)
      try {
        await voter.connect(owner).reset(veId, [vote._type], [vote.target]);
      } catch (e) {
        console.log('vote can not be removed!', veId, voted.toNumber());

        await voter.emergencyResetVote(veId, 0, false);
      }
    }
  }

  for (const _type of [1, 2, 3]) {
    if (_type === 3) {
      for (const t of targets) {
        await checkW(_type, t, voter);
      }
    } else {
      await checkW(_type, Misc.ZERO_ADDRESS, voter);
    }
  }


}

async function checkW(_type: number, target: string, voter: PlatformVoter) {
  const totalWeight = (await voter.attributeWeights(_type, target)).toString();
  const totalValues = (await voter.attributeValues(_type, target)).toString();
  console.log('total: ', _type, target, totalWeight, totalValues);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
