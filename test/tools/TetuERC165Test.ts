import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/utils/DeployerUtils";
import {InterfaceIds, MockToken, TetuERC165Test} from "../../typechain";
import {TimeUtils} from "../TimeUtils";
import {expect} from "chai";

describe("TetuERC165Test", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;

  let test: TetuERC165Test;
  let interfaceIds: InterfaceIds;
  let token: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer] = await ethers.getSigners();

    interfaceIds = await DeployerUtils.deployContract(signer, 'InterfaceIds') as InterfaceIds;
    test = await DeployerUtils.deployContract(signer, 'TetuERC165Test') as TetuERC165Test;
    token = await DeployerUtils.deployMockToken(signer, 'TOKEN', 18);

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


  it("is interface supported", async () => {
    expect(await test.isInterfaceSupported(ethers.constants.AddressZero, '0x00000000')).eq(false);
    expect(await test.isInterfaceSupported(test.address, '0x00000000')).eq(false);
    expect(await test.isInterfaceSupported(test.address, await interfaceIds.I_TETU_ERC165())).eq(true);
    expect(await test.isInterfaceSupported(token.address, await interfaceIds.I_CONTROLLER())).eq(false);
  });

  it("require interface", async () => {
    const I_TETU_ERC165 = await interfaceIds.I_TETU_ERC165();
    const I_CONTROLLER = await interfaceIds.I_CONTROLLER();
    expect(await test.requireInterface(test.address, I_TETU_ERC165)).deep.eq([]); // executed without return values
    expect(test.requireInterface(test.address, '0x00000000')).revertedWith('Interface is not supported');
    expect(test.requireInterface(test.address, I_CONTROLLER)).revertedWith('Interface is not supported');
  });

  it("is ERC20", async () => {
    expect(await test.isERC20(ethers.constants.AddressZero)).eq(false);
    expect(await test.isERC20(test.address)).eq(false);
    expect(await test.isERC20(token.address)).eq(true);
  });


  it("require ERC20", async () => {
    expect(await test.requireERC20(token.address)).deep.eq([]); // executed without return values
    expect(test.requireERC20(test.address)).revertedWith('Not ERC20');
    expect(test.requireERC20(ethers.constants.AddressZero)).revertedWith('Not ERC20');
  });


})
