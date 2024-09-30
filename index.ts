import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractReceipt,
  Signer,
  utils,
  providers,
  Wallet,
} from "ethers";
import { abi } from "./artifacts/contracts/NativeVRF.sol/NativeVRF.json";

const delay = (delayMs: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, delayMs);
  });
};

const runInterval = async (handler: Function, delayMs: number) => {
  await handler();
  await delay(delayMs);
  await runInterval(handler, delayMs);
};

const messageHashFromNumbers = (values: BigNumberish[]) => {
  const types = values.map(() => "uint256");
  return utils.solidityKeccak256(types, values);
};

const convertSignatureLocal = (signature: utils.BytesLike) => {
  const truncatedNumber = BigNumber.from(signature).toHexString().slice(0, 66);
  return BigNumber.from(truncatedNumber);
};

const calculateRandomInput = async (
  signer: Signer,
  nativeVRF: Contract,
  requestId: string
) => {
  let input = 0;
  let found = 0;

  const prevRandom = await nativeVRF.randomResults(Number(requestId) - 1);
  const difficulty = await nativeVRF.difficulty();

  do {
    const message = messageHashFromNumbers([prevRandom, input]);
    const signature = await signer.signMessage(utils.arrayify(message));
    const value = convertSignatureLocal(signature);

    if (value.mod(difficulty).eq(0)) {
      found = input;
    }

    input++;
  } while (found === 0);

  const message = messageHashFromNumbers([prevRandom, found]);
  const signature = await signer.signMessage(utils.arrayify(message));

  return { input: found, signature };
};

const decordOutputs = (receipt: ContractReceipt) => {
  const events = receipt.events;
  if (!events) return [];
  return events.filter((e) => e.event).map((e) => [e.event, e.args]);
};

async function main() {
  const { RPC_URL, VRF_CONTRACT_ADDRESS, PRIVATE_KEY, DELAY_TIME } =
    process.env;

  if (!RPC_URL || !VRF_CONTRACT_ADDRESS || !PRIVATE_KEY) {
    throw new Error("Missing environment variables");
  }

  const provider = new providers.JsonRpcProvider(RPC_URL);
  const signer = new Wallet(PRIVATE_KEY, provider);
  const nativeVRF = new Contract(VRF_CONTRACT_ADDRESS, abi, signer);

  const delayMs = parseInt(DELAY_TIME!) || 10000;

  runInterval(async () => {
    try {
      const curRequestId = await nativeVRF.currentRequestId();
      const latestFulfill = await nativeVRF.latestFulfillId();
      const requestId = latestFulfill.add(1);

      if (curRequestId.eq(requestId)) {
        console.log(
          "There is no new random request. Wait for the incoming requests..."
        );
        return;
      }

      console.log("Found new random request");
      console.log(
        "Current ID: ",
        curRequestId.toString(),
        "Last fulfill ID",
        latestFulfill.toString(),
        "Submitted Fultill ID: ",
        requestId.toString()
      );

      const { input, signature } = await calculateRandomInput(
        signer,
        nativeVRF,
        requestId.toString()
      );

      const tx = await nativeVRF.fulfillRandomness(
        [requestId],
        [input],
        [signature]
      );

      console.log("Submit fulfill transaction");

      const receipt = await tx.wait();

      console.log("Fulfll randomness successfully");
      console.log("Data: ", decordOutputs(receipt));
    } catch (e) {
      console.error("Error fulfill randomness", e);
    }
  }, delayMs);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
