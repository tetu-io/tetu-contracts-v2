import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {
  ControllerMinimal, ProxyControlled, ProxyControlled__factory,
  SlotsTest,
  SlotsTest2,
  SlotsTest2__factory,
  SlotsTest__factory, StringLibFacade
} from "../../typechain";
import {formatBytes32String} from "ethers/lib/utils";
import {TimeUtils} from "../TimeUtils";
import {Addresses} from "../../scripts/addresses/addresses";
import {Misc} from "../../scripts/utils/Misc";
import {utils} from "ethers";

describe("StringLibTest", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let lib: StringLibFacade;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();

    lib = await DeployerUtils.deployContract(signer, 'StringLibFacade') as StringLibFacade;
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


  it("toString", async () => {
    expect(await lib.uintToString(100)).eq('100')
  });

  it("toAsciiString", async () => {
    expect(await lib.toAsciiString(Misc.ZERO_ADDRESS)).eq('0000000000000000000000000000000000000000')
  });

  it("char", async () => {
    expect(await lib.char(utils.toUtf8Bytes('z'))).eq('0xd1')
  });


})
