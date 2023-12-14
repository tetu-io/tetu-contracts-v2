import {IERC20__factory, MockToken__factory} from "../typechain";
import {BigNumber} from "ethers";
import {PolygonAddresses as MaticAddresses} from "../scripts/addresses/polygon";
import {parseUnits} from "ethers/lib/utils";
import {Misc} from "../scripts/utils/Misc";
import {BaseAddresses} from "../scripts/addresses/base";

export class TokenUtils {

  // use the most neutral place, some contracts (like swap pairs) can be used in tests and direct transfer ruin internal logic
  public static TOKEN_HOLDERS = new Map<string, string>([
    [MaticAddresses.WMATIC_TOKEN, '0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4'.toLowerCase()], // aave
    [MaticAddresses.WETH_TOKEN, '0x28424507fefb6f7f8e9d3860f56504e4e5f5f390'.toLowerCase()], // aave
    [MaticAddresses.WBTC_TOKEN, '0x5c2ed810328349100a66b82b78a1791b101c9d61'.toLowerCase()], // aave v2
    [MaticAddresses.USDC_TOKEN, '0x1a13f4ca1d028320a707d99520abfefca3998b7f'.toLowerCase()], // aave
    [MaticAddresses.USDT_TOKEN, '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe'.toLowerCase()], // adr
    [MaticAddresses.TETU_TOKEN, '0x7ad5935ea295c4e743e4f2f5b4cda951f41223c2'.toLowerCase()], // fund keeper
    [MaticAddresses.AAVE_TOKEN, '0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360'.toLowerCase()], // aave
    [MaticAddresses.DAI_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.LINK_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.BAL_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.QI_TOKEN, '0x3FEACf904b152b1880bDE8BF04aC9Eb636fEE4d8'.toLowerCase()], // qidao gov
    [MaticAddresses.xTETU, '0x352f9fa490a86f625f53e581f0ec3bd649fd8bc9'.toLowerCase()],
    [MaticAddresses.BALANCER_TETU_USDC, '0x2F5294b805f6c0b4B7942c88111d8fB3c0597051'.toLowerCase()],

    [BaseAddresses.USDbC_TOKEN, '0x4c80e24119cfb836cdf0a6b53dc23f04f7e652ca'.toLowerCase()],
    [BaseAddresses.TETU_TOKEN, '0x0644141dd9c2c34802d28d334217bd2034206bf7'.toLowerCase()],
    [BaseAddresses.tUSDbC, '0x0644141dd9c2c34802d28d334217bd2034206bf7'.toLowerCase()],
  ]);

  public static async getToken(token: string, to: string, amount?: BigNumber) {
    const start = Date.now();
    const holder = TokenUtils.TOKEN_HOLDERS.get(token.toLowerCase()) as string;
    if (!holder) {
      throw new Error('Please add holder for ' + token);
    }
    const signer = await Misc.impersonate(holder);
    const name = await MockToken__factory.connect(token, signer).name();
    console.log('transfer token from biggest holder', name, token, amount?.toString());

    if (name.endsWith('_MOCK_TOKEN')) {
      const amount0 = amount || parseUnits('100');
      await MockToken__factory.connect(token, signer).mint(to, amount0);
      return amount0;
    }

    const balance = (await IERC20__factory.connect(token, signer).balanceOf(holder)).div(100);
    console.log('holder balance', balance.toString());
    if (amount) {
      await IERC20__factory.connect(token, signer).transfer(to, amount)
    } else {
      await IERC20__factory.connect(token, signer).transfer(to, balance)
    }
    Misc.printDuration('getToken completed', start);
    return balance;
  }

}
