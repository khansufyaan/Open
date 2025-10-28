import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NEW_WALLET = "0xE1A01E53FfbfBb432c9f8A88B515d1D7840BA1D8";
const OLD_WALLET = "0xf9a2a2E165BB56970A287Ce657eadb424a493ffA";

const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

async function checkBalances() {
  console.log("Checking USDC balances on Base...\n");

  // Check new wallet
  const newBalance = await client.readContract({
    address: USDC_CONTRACT as any,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [NEW_WALLET as any],
  });

  // Check old wallet
  const oldBalance = await client.readContract({
    address: USDC_CONTRACT as any,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [OLD_WALLET as any],
  });

  // Check ETH balances
  const newEth = await client.getBalance({ address: NEW_WALLET as any });
  const oldEth = await client.getBalance({ address: OLD_WALLET as any });

  console.log("NEW WALLET (0xE1A0...):");
  console.log(`  USDC: ${Number(newBalance) / 1_000_000} USDC`);
  console.log(`  ETH: ${Number(newEth) / 1e18} ETH`);
  console.log("");
  console.log("OLD WALLET (0xf9a2...):");
  console.log(`  USDC: ${Number(oldBalance) / 1_000_000} USDC`);
  console.log(`  ETH: ${Number(oldEth) / 1e18} ETH`);
  console.log("");
  console.log("Which address are you sending to?");
  console.log(`NEW: ${NEW_WALLET}`);
  console.log(`OLD: ${OLD_WALLET}`);
}

checkBalances();
