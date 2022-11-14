import {ethers, web3} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {DepositHelper, IERC20__factory, MockToken, MockVault, VeTetu} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {expect} from "chai";
import fetch from "node-fetch";
import {formatUnits, parseUnits} from "ethers/lib/utils";
import {PolygonAddresses} from "../../scripts/addresses/polygon";
import {TokenUtils} from "../TokenUtils";
import {Misc} from "../../scripts/utils/Misc";

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

describe("Deposit helper Tests poly", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let strategy: SignerWithAddress;
  let referrer: SignerWithAddress;

  let tetu: MockToken;
  let vault: MockVault;
  let helper: DepositHelper;
  let ve: VeTetu;
  const vaultAsset = PolygonAddresses.WETH_TOKEN;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    if (hre.network.config.chainId !== 137) {
      return;
    }
    signer = await Misc.impersonate('0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94');
    [strategy, referrer] = await ethers.getSigners();

    tetu = await DeployerUtils.deployMockToken(signer);
    const controller = await DeployerUtils.deployMockController(signer);
    vault = await DeployerUtils.deployMockVault(signer, controller.address, vaultAsset, 'V', strategy.address, 1);
    helper = await DeployerUtils.deployContract(signer, 'DepositHelper', PolygonAddresses.ONE_INCH_ROUTER) as DepositHelper;

    ve = await DeployerUtils.deployVeTetu(signer, tetu.address, controller.address);

    await IERC20__factory.connect(vaultAsset, strategy).approve(vault.address, Misc.MAX_UINT);
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });


  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });


  it("test convert and deposit", async () => {
    if (hre.network.config.chainId !== 137) {
      return;
    }

    const tokenIn = PolygonAddresses.DAI_TOKEN;
    const amount = parseUnits('1');

    const params = {
      fromTokenAddress: tokenIn,
      toTokenAddress: vaultAsset,
      amount: amount.toString(),
      fromAddress: signer.address,
      slippage: 1,
      disableEstimate: false,
      allowPartialFill: false,
      destReceiver: helper.address,
      referrerAddress: referrer.address,
      fee: 3
    };

    const swapTransaction = await buildTxForSwap(JSON.stringify(params));
    console.log('Transaction for swap: ', swapTransaction);

    // ethers.utils.defaultAbiCoder.decode()

    const balance = await IERC20__factory.connect(tokenIn, signer).balanceOf(signer.address)
    console.log('token in balance', formatUnits(balance))
    expect(balance.gte(amount)).eq(true);

    await IERC20__factory.connect(tokenIn, signer).approve(helper.address, Misc.MAX_UINT)
    await helper.convertAndDeposit(
      swapTransaction.data,
      tokenIn,
      amount,
      vault.address,
    )
    expect((await vault.balanceOf(signer.address)).isZero()).eq(false);
    expect((await IERC20__factory.connect(tokenIn, signer).balanceOf(referrer.address)).isZero()).eq(false);
  });

  it("test withdraw and convert", async () => {
    if (hre.network.config.chainId !== 137) {
      return;
    }

    const vaultAssetBalance = await IERC20__factory.connect(vaultAsset, signer).balanceOf(signer.address);
    await IERC20__factory.connect(vaultAsset, signer).approve(helper.address, Misc.MAX_UINT)
    await helper.deposit(vault.address, vaultAsset, vaultAssetBalance);

    const vaultShareBalance = await IERC20__factory.connect(vault.address, signer).balanceOf(signer.address);
    const returnAmount = await vault.previewRedeem(vaultShareBalance)


    const tokenOut = PolygonAddresses.DAI_TOKEN;

    const params = {
      fromTokenAddress: vaultAsset,
      toTokenAddress: tokenOut,
      amount: returnAmount.toString(),
      fromAddress: signer.address,
      slippage: 1,
      disableEstimate: false,
      allowPartialFill: false,
      destReceiver: helper.address,
      referrerAddress: referrer.address,
      fee: 3
    };

    const swapTransaction = await buildTxForSwap(JSON.stringify(params));
    console.log('Transaction for swap: ', swapTransaction);


    await vault.approve(helper.address, Misc.MAX_UINT)
    await helper.withdrawAndConvert(
      vault.address,
      vaultShareBalance,
      swapTransaction.data,
      tokenOut
    )
    expect((await IERC20__factory.connect(tokenOut, signer).balanceOf(signer.address)).isZero()).eq(false);
  });

})

function apiRequestUrl(methodName: string, queryParams: string) {
  const chainId = hre.network.config.chainId;
  const apiBaseUrl = 'https://api.1inch.io/v4.0/' + chainId;
  const r = (new URLSearchParams(JSON.parse(queryParams))).toString();
  return apiBaseUrl + methodName + '?' + r;
}

async function buildTxForSwap(params: string) {
  const url = apiRequestUrl('/swap', params);
  console.log('url', url)
  return fetch(url).then(res => {
    // console.log('res', res)
    return res.json();
  }).then(res => res.tx);
}


async function buildTxForApproveTradeWithRouter(tokenAddress: string, amount: string, from: string) {
  const url = apiRequestUrl(
    '/approve/transaction',
    JSON.stringify(amount ? {tokenAddress, amount} : {tokenAddress})
  );

  const transaction = await fetch(url).then(res => res.json());

  const gasLimit = await web3.eth.estimateGas({
    ...transaction,
    from
  });

  return {
    ...transaction,
    gas: gasLimit
  };
}

