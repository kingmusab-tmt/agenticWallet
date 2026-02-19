import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { KORA_RPC_URL } from "../config.js";

export class KoraClient {
  private readonly koraConnection: Connection | null;

  constructor(koraUrl?: string) {
    const url = (koraUrl ?? KORA_RPC_URL).trim();
    this.koraConnection = url ? new Connection(url, "confirmed") : null;
  }

  isEnabled(): boolean {
    return this.koraConnection !== null;
  }

  async sendTransaction(
    tx: Transaction | VersionedTransaction,
  ): Promise<string> {
    if (!this.koraConnection) {
      throw new Error("Kora RPC URL not configured.");
    }

    // Kora paymaster will sponsor the fee
    const rawTx =
      tx instanceof Transaction
        ? tx.serialize({ requireAllSignatures: false })
        : tx.serialize();

    const signature = await this.koraConnection.sendRawTransaction(rawTx);
    await this.koraConnection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  getConnection(): Connection {
    if (!this.koraConnection) {
      throw new Error("Kora RPC URL not configured.");
    }
    return this.koraConnection;
  }
}
