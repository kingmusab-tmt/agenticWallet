import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { KEYSTORE_DIR, RPC_URL } from "../config.js";
import { KeyManager } from "./KeyManager.js";
import { KoraClient } from "../kora/KoraClient.js";
import { ProgramAllowlist } from "../security/ProgramAllowlist.js";

export class WalletService {
  private readonly connection: Connection;
  private readonly keyManager: KeyManager;
  private readonly dir: string;
  private readonly koraClient: KoraClient;
  private readonly allowlist: ProgramAllowlist;

  constructor(options?: {
    connection?: Connection;
    keyManager?: KeyManager;
    dir?: string;
    koraClient?: KoraClient;
    allowlist?: ProgramAllowlist;
  }) {
    this.connection =
      options?.connection ?? new Connection(RPC_URL, "confirmed");
    this.keyManager = options?.keyManager ?? new KeyManager();
    this.dir = options?.dir ?? KEYSTORE_DIR;
    this.koraClient = options?.koraClient ?? new KoraClient();
    this.allowlist = options?.allowlist ?? new ProgramAllowlist();
  }

  async createWallet(name: string): Promise<Keypair> {
    const keypair = Keypair.generate();
    await this.keyManager.saveKeypair(this.dir, name, keypair);
    return keypair;
  }

  async loadWallet(name: string): Promise<Keypair> {
    return this.keyManager.loadKeypair(this.dir, name);
  }

  async listWallets(): Promise<string[]> {
    return this.keyManager.listKeypairs(this.dir);
  }

  async signTransaction(
    tx: Transaction,
    wallet: Keypair,
  ): Promise<Transaction> {
    if (!tx.feePayer) {
      tx.feePayer = wallet.publicKey;
    }
    if (!tx.recentBlockhash) {
      const { blockhash } =
        await this.connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
    }
    tx.sign(wallet);
    return tx;
  }

  async simulateTransaction(tx: Transaction): Promise<{
    err: unknown | null;
    logs: string[] | null;
    unitsConsumed: number;
  }> {
    const { value } = await this.connection.simulateTransaction(tx);
    return {
      err: value.err,
      logs: value.logs,
      unitsConsumed: value.unitsConsumed ?? 0,
    };
  }

  async sendTransaction(
    tx: Transaction,
    options?: { skipSimulation?: boolean },
  ): Promise<string> {
    // Validate against program allowlist
    this.allowlist.validateTransaction(tx);

    // Simulate transaction first (unless explicitly skipped)
    if (!options?.skipSimulation) {
      const simulation = await this.simulateTransaction(tx);
      if (simulation.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.err)}`,
        );
      }
    }

    // Use Kora if enabled, otherwise use standard RPC
    if (this.koraClient.isEnabled()) {
      return this.koraClient.sendTransaction(tx);
    }

    const signature = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  getConnection(): Connection {
    return this.connection;
  }
}
