import {VeTetu} from "../typechain";
import {formatUnits} from "ethers/lib/utils";
import chai from "chai";

const {expect} = chai;

export const WEEK = 60 * 60 * 24 * 7;
export const LOCK_PERIOD = 60 * 60 * 24 * 90;

export async function currentEpochTS(ve: VeTetu) {
  const blockTs = await currentTS(ve)
  return Math.floor(blockTs / WEEK) * WEEK;
}

export async function currentTS(ve: VeTetu) {
  return (await ve.blockTimestamp()).toNumber();
}

export async function checkTotalVeSupplyAtTS(ve: VeTetu, ts: number) {
  await ve.checkpoint();

  // console.log('additionalTotalSupply', formatUnits(await ve.additionalTotalSupply()))

  const total = +formatUnits(await ve.totalSupplyAtT(ts));
  // console.log('total', total)
  const nftCount = (await ve.tokenId()).toNumber();

  let sum = 0;
  for (let i = 1; i <= nftCount; ++i) {
    const bal = +formatUnits(await ve.balanceOfNFTAt(i, ts))
    // console.log('bal', i, bal)
    sum += bal;
  }
  // console.log('sum', sum)
  expect(sum).approximately(total, 0.0000000000001);
  // console.log('total supply is fine')
}
