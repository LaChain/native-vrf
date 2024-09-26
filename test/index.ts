import { expect } from "chai";
import { ethers } from "hardhat";

describe("NativeVRF", function () {
  const signer = ethers.provider.getSigner();
  let snapshotId: any;

  this.beforeAll(async function () {
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  this.afterEach(async function () {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

  it("Should deploy the contract", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();
    const tx = await vrf.deployTransaction.wait();

    expect(await vrf.requestInitializers(0)).to.equal(
      await signer.getAddress()
    );
    expect(await vrf.randomResults(0)).not.to.equal(0);
    expect(await vrf.latestFulfillmentBlock()).to.equal(tx.blockNumber);
    expect(await vrf.nBlockFulfillments(tx.blockNumber)).to.equal(1);
    expect(await vrf.MIN_DIFFICULTY()).to.equal(1000);
    expect(await vrf.EXPECTED_FULFILL_TIME()).to.equal(15);
    expect(await vrf.ESTIMATED_HASH_POWER()).to.equal(100);
    expect(await vrf.difficulty()).to.equal(1500);
    expect(await vrf.currentRequestId()).to.equal(1);
    expect(await vrf.latestFulfillId()).to.equal(0);
  });

  it("Should request a random number", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    const tx = await (
      await vrf.requestRandom(1, {
        value: ethers.utils.parseEther("0.0001"),
      })
    ).wait();
    const requestId = tx.events![0].args!.requestId;

    expect(await vrf.requestInitializers(requestId)).to.equal(
      await signer.getAddress()
    );
    expect(await vrf.rewards(requestId)).to.equal(
      ethers.utils.parseEther("0.0001")
    );
    expect(await vrf.currentRequestId()).to.equal(2);
    // check for the RandomRequested event
    expect(tx.events![0].event).to.equal("RandomRequested");
  });

  it("Should request multiple random numbers", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    const tx = await (
      await vrf.requestRandom(3, {
        value: ethers.utils.parseEther("0.0003"),
      })
    ).wait();
    const requestId = tx.events![0].args!.requestId;

    expect(await vrf.requestInitializers(requestId)).to.equal(
      await signer.getAddress()
    );
    expect(await vrf.rewards(requestId)).to.equal(
      ethers.utils.parseEther("0.0001")
    );
    expect(await vrf.currentRequestId()).to.equal(4);
    expect(tx.events![0].event).to.equal("RandomRequested");
    expect(tx.events![1].event).to.equal("RandomRequested");
    expect(tx.events![2].event).to.equal("RandomRequested");
  });

  it("Should revert when requesting zero random numbers", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    await expect(
      vrf.requestRandom(0, {
        value: ethers.utils.parseEther("0.0001"),
      })
    ).to.be.revertedWith("At least one request");
  });

  it("Should revert when requesting a random number with low reward", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    await expect(
      vrf.requestRandom(1, {
        value: ethers.utils.parseEther("0.00001"),
      })
    ).to.be.revertedWith("Reward is too low");
  });

  it("Should fulfill a random number request", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    let tx = await (
      await vrf.requestRandom(3, {
        value: ethers.utils.parseEther("0.0003"),
      })
    ).wait();

    const requestId = tx.events![0].args!.requestId;
    let input = 0;
    let found = 0;

    const prevRandom = await vrf.randomResults(Number(requestId) - 1);
    const difficulty = await vrf.difficulty();

    do {
      const message = ethers.utils.solidityKeccak256(
        ["uint256", "uint256"],
        [prevRandom, input]
      );
      const signature = await signer.signMessage(
        ethers.utils.arrayify(message)
      );
      const truncatedNumber = ethers.BigNumber.from(signature)
        .toHexString()
        .slice(0, 66);
      const value = ethers.BigNumber.from(truncatedNumber);

      if (value.mod(difficulty).eq(0)) {
        found = input;
      }

      input++;
    } while (found === 0);

    const message = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [prevRandom, found]
    );
    const signature = await signer.signMessage(ethers.utils.arrayify(message));

    tx = await (
      await vrf.fulfillRandomness([requestId], [found], [signature])
    ).wait();

    expect(await vrf.randomResults(requestId)).not.to.equal(0);
    expect(await vrf.rewards(requestId)).to.equal(0);
    expect(await vrf.nBlockFulfillments(tx.blockNumber)).to.equal(1);
    expect(await vrf.latestFulfillId()).to.equal(1);
    expect(await vrf.difficulty()).to.equal(1000);
    expect(await vrf.currentRequestId()).to.equal(4);
    expect(await vrf.latestFulfillmentBlock()).to.equal(tx.blockNumber);
  });

  it("Should get the message hash from the provided input requestId zero", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    const messageHash = await vrf.getMessageHash(0, 42);
    const expectedMessageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [0, 42])
    );

    expect(messageHash).to.equal(expectedMessageHash);
  });

  it("Should get the message hash from the provided input requestId greater than zero", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();
    const prevRand = await vrf.randomResults(0);

    const messageHash = await vrf.getMessageHash(1, 42);
    const expectedMessageHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["uint256", "uint256"],
        [prevRand, 42]
      )
    );

    expect(messageHash).to.equal(expectedMessageHash);
  });

  it("Should convert signatures to number values", async function () {
    const NativeVRF = await ethers.getContractFactory("NativeVRF");
    const vrf = await NativeVRF.deploy(42);
    await vrf.deployed();

    const signatures = [
      ethers.utils.hexZeroPad("0x01", 32),
      ethers.utils.hexZeroPad("0x02", 32),
    ];
    const results = await vrf.convertSignatures(signatures);

    expect(results[0]).to.equal(1);
    expect(results[1]).to.equal(2);
  });
});
