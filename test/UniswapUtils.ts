import {UniswapV2Factory, UniswapV2Router02} from "../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../scripts/utils/DeployerUtils";

export class UniswapUtils {
  public static deadline = "1000000000000";

  public static async deployUniswap(signer: SignerWithAddress) {
    const factory = await DeployerUtils.deployContract(signer, 'UniswapV2Factory', signer.address) as UniswapV2Factory;
    const netToken = (await DeployerUtils.deployMockToken(signer, 'WETH')).address.toLowerCase();
    const router = await DeployerUtils.deployContract(signer, 'UniswapV2Router02', factory.address, netToken) as UniswapV2Router02;
    return {
      factory,
      netToken,
      router
    }
  }

}
