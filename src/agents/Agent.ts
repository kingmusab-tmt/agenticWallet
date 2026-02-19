import { Keypair } from "@solana/web3.js";
import { SplBalance } from "../tokens/TokenService.js";

export type AgentRecord = {
  id: string;
  walletName: string;
  walletAddress: string;
  strategy: string;
  createdAt: string;
  splBalances?: SplBalance[];
  solSpent?: number;
  spendingLimit?: number;
  lastUpdated?: string;
};

export type Agent = {
  record: AgentRecord;
  wallet: Keypair;
};
