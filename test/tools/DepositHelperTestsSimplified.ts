// import {ethers, web3} from "hardhat";
// import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
// import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
// import {
//   DepositHelperPolygon,
//   DepositHelperSimplified,
//   IERC20__factory, IERC20Metadata__factory,
//   MockToken,
//   MockVault,
//   VeTetu,
//   VeTetu__factory
// } from '../../typechain';
// import {TimeUtils} from "../TimeUtils";
// import {expect} from "chai";
// import fetch from "node-fetch";
// import {formatUnits, parseUnits} from "ethers/lib/utils";
// import {PolygonAddresses} from "../../scripts/addresses/polygon";
// import {TokenUtils} from "../TokenUtils";
// import {Misc} from "../../scripts/utils/Misc";
// import {BigNumber, BytesLike} from "ethers";
//
// // tslint:disable-next-line:no-var-requires
// const hre = require("hardhat");
//
// describe("DepositHelperTestsSimplified", function () {
//   let snapshotBefore: string;
//   let snapshot: string;
//   let signer: SignerWithAddress;
//   let strategy: SignerWithAddress;
//   let referrer: SignerWithAddress;
//
//   let tetu: MockToken;
//   let vault: MockVault;
//   let helper: DepositHelperSimplified;
//   const vaultAsset = PolygonAddresses.TETU_TOKEN;
//
//   //region OpenOcean utils
//   type IOpenOceanResponse = {
//     data: {
//       to?: string,
//       data?: string,
//       outAmount?: string
//     }
//   }
//
//   /** see https://docs.openocean.finance/dev/aggregator-api-and-sdk/aggregator-api */
//   async function buildSwapTransactionDataForOpenOcean(
//     tokenIn: string,
//     tokenOut: string,
//     amount: BigNumber,
//     from: string,
//     slippage: string = "0.5"
//   ) : Promise<BytesLike> {
//     const chainName = "polygon"; // openOceanChains.get(chainId) ?? 'unknown chain';
//     const params = {
//       chain: chainName,
//       inTokenAddress: tokenIn,
//       outTokenAddress: tokenOut,
//       amount: +formatUnits(amount, await IERC20Metadata__factory.connect(tokenIn, signer).decimals()),
//       account: from,
//       slippage,
//       gasPrice: 30,
//     };
//
//     const url = `https://open-api.openocean.finance/v3/${chainName}/swap_quote?${(new URLSearchParams(JSON.parse(JSON.stringify(params)))).toString()}`;
//     console.log('OpenOcean API request', url);
//     const r = await fetch(url, {});
//     if (r && r.status === 200) {
//       const json = await r.json();
//       console.log("JSON", json);
//       const quote: IOpenOceanResponse = json as unknown as IOpenOceanResponse;
//       if (quote && quote.data && quote.data.to && quote.data.data && quote.data.outAmount) {
//         return quote.data.data;
//       } else {
//         throw Error(`open ocean can not fetch url=${url}, qoute=${quote}`);
//       }
//     } else {
//       throw Error(`open ocean error url=${url}, status=${r.status}`);
//     }
//   }
// //endregion OpenOcean utils
//
//   before(async function () {
//     snapshotBefore = await TimeUtils.snapshot();
//     if (hre.network.config.chainId !== 137) {
//       return;
//     }
//     signer = await Misc.impersonate('0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94');
//     [strategy, referrer] = await ethers.getSigners();
//
//     // await IERC20__factory.connect(vaultAsset, await Misc.impersonate('0x28424507fefb6f7f8e9d3860f56504e4e5f5f390')).transfer(signer.address, parseUnits('1000'));
//
//     tetu = await DeployerUtils.deployMockToken(signer);
//     const controller = await DeployerUtils.deployMockController(signer);
//     vault = await DeployerUtils.deployMockVault(signer, controller.address, vaultAsset, 'V', strategy.address, 1);
//     helper = await DeployerUtils.deployContract(signer, 'DepositHelperSimplified', PolygonAddresses.OPENOCEAN_ROUTER) as DepositHelperSimplified;
//
//     await IERC20__factory.connect(vaultAsset, strategy).approve(vault.address, Misc.MAX_UINT);
//   });
//
//   after(async function () {
//     await TimeUtils.rollback(snapshotBefore);
//   });
//
//
//   beforeEach(async function () {
//     snapshot = await TimeUtils.snapshot();
//   });
//
//   afterEach(async function () {
//     await TimeUtils.rollback(snapshot);
//   });
//
//
//   it("test convert and deposit", async () => {
//     if (hre.network.config.chainId !== 137) {
//       return;
//     }
//
//     const tokenIn = PolygonAddresses.USDC_TOKEN;
//
//     const amount = parseUnits('1', 6);
//     await TokenUtils.getToken(tokenIn, signer.address, amount)
//
//     const swapTransactionData = await buildSwapTransactionDataForOpenOcean(tokenIn, vaultAsset, amount, signer.address);
//     console.log('Transaction for swap: ', swapTransactionData);
//
//     // ethers.utils.defaultAbiCoder.decode()
//
//     const balance = await IERC20__factory.connect(tokenIn, signer).balanceOf(signer.address)
//     console.log('token in balance', formatUnits(balance, 6))
//     expect(balance.gte(amount)).eq(true);
//
//     await IERC20__factory.connect(tokenIn, signer).approve(helper.address, Misc.MAX_UINT)
//     await expect(helper.convertAndDeposit(
//       swapTransactionData,
//       tokenIn,
//       amount,
//       vault.address,
//       parseUnits('100000')
//     )).to.be.reverted; // SLIPPAGE
//
//     await helper.convertAndDeposit(
//       swapTransactionData,
//       tokenIn,
//       amount,
//       vault.address,
//       0
//     )
//     expect((await IERC20__factory.connect(vaultAsset, signer).balanceOf(signer.address)).isZero()).eq(false);
//     expect((await IERC20__factory.connect(tokenIn, signer).balanceOf(referrer.address)).isZero()).eq(false);
//   });
//
//   it("test withdraw and convert", async () => {
//     if (hre.network.config.chainId !== 137) {
//       return;
//     }
//
//     await TokenUtils.getToken(vaultAsset, signer.address, parseUnits('1', 18))
//     const vaultAssetBalance = await IERC20__factory.connect(vaultAsset, signer).balanceOf(signer.address);
//     await IERC20__factory.connect(vaultAsset, signer).approve(helper.address, Misc.MAX_UINT)
//     await helper.deposit(vault.address, vaultAsset, vaultAssetBalance, 0);
//
//     const vaultShareBalance = await IERC20__factory.connect(vault.address, signer).balanceOf(signer.address);
//     const returnAmount = await vault.previewRedeem(vaultShareBalance)
//
//     const tokenOut = PolygonAddresses.USDC_TOKEN;
//
//     const swapTransactionData = await buildSwapTransactionDataForOpenOcean(vaultAsset, vaultAsset, returnAmount, signer.address);
//     console.log('Transaction for swap: ', swapTransactionData);
//
//
//     await vault.approve(helper.address, Misc.MAX_UINT)
//     await expect(helper.withdrawAndConvert(
//       vault.address,
//       vaultShareBalance,
//       swapTransactionData,
//       tokenOut,
//       parseUnits('100000')
//     )).to.be.revertedWith('SLIPPAGE')
//     await helper.withdrawAndConvert(
//       vault.address,
//       vaultShareBalance,
//       swapTransactionData,
//       tokenOut,
//       0
//     )
//     expect((await IERC20__factory.connect(tokenOut, signer).balanceOf(signer.address)).isZero()).eq(false);
//   });
// })
//
//
