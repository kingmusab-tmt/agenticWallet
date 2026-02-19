import "dotenv/config";
import path from "node:path";

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const AIRDROP_RPC_URL = process.env.AIRDROP_RPC_URL ?? "";
export const KEYSTORE_DIR = process.env.KEYSTORE_DIR ?? "keys";
export const KEYSTORE_PASSPHRASE = process.env.KEYSTORE_PASSPHRASE ?? "";
export const AGENT_STORE =
  process.env.AGENT_STORE ?? path.join("data", "agents.json");

// Spending limits (SOL per agent)
export const DEFAULT_SPENDING_LIMIT = parseFloat(
  process.env.DEFAULT_SPENDING_LIMIT ?? "1.0",
);

// Program allowlist (comma-separated program IDs)
export const PROGRAM_ALLOWLIST = process.env.PROGRAM_ALLOWLIST
  ? process.env.PROGRAM_ALLOWLIST.split(",").map((s) => s.trim())
  : [];

// Kora RPC endpoint (optional)
export const KORA_RPC_URL = process.env.KORA_RPC_URL ?? "";
