import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from "@solana/spl-token";
import { AIRDROP_RPC_URL } from "../config.js";

export type SplBalance = {
  mint: string;
  amount: string;
  decimals: number;
};

export class TokenService {
  private readonly airdropConnection: Connection;

  constructor(private readonly connection: Connection) {
    const airdropUrl = AIRDROP_RPC_URL.trim();
    this.airdropConnection =
      airdropUrl && airdropUrl !== connection.rpcEndpoint
        ? new Connection(airdropUrl, "confirmed")
        : connection;
  }

  async getSolBalance(pubkey: PublicKey): Promise<number> {
    const lamports = await this.connection.getBalance(pubkey, "confirmed");
    return lamports / LAMPORTS_PER_SOL;
  }

  async requestAirdrop(pubkey: PublicKey, sol: number): Promise<string> {
    const signature = await this.airdropConnection.requestAirdrop(
      pubkey,
      Math.round(sol * LAMPORTS_PER_SOL),
    );
    await this.airdropConnection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  async transferSol(
    from: Keypair,
    to: PublicKey,
    sol: number,
  ): Promise<string> {
    const lamports = Math.round(sol * LAMPORTS_PER_SOL);

    // Retry up to 3 times with fresh blockhashes to handle devnet congestion
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } =
          await this.connection.getLatestBlockhash("confirmed");

        const tx = new Transaction({
          blockhash,
          lastValidBlockHeight,
          feePayer: from.publicKey,
        }).add(
          SystemProgram.transfer({
            fromPubkey: from.publicKey,
            toPubkey: to,
            lamports,
          }),
        );

        const signature = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [from],
          {
            commitment: "confirmed",
            maxRetries: 3,
            preflightCommitment: "confirmed",
          },
        );
        return signature;
      } catch (err) {
        lastError = err;
        const msg = String(err);
        if (
          msg.includes("block height exceeded") ||
          msg.includes("Blockhash not found")
        ) {
          // Retry with a fresh blockhash
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async getSplBalances(owner: PublicKey): Promise<SplBalance[]> {
    const accounts = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID },
      "confirmed",
    );

    return accounts.value.map((entry) => {
      const info = entry.account.data.parsed.info;
      return {
        mint: info.mint as string,
        amount: (info.tokenAmount.uiAmountString as string | null) ?? "0",
        decimals: info.tokenAmount.decimals as number,
      };
    });
  }

  async createSplMint(payer: Keypair, decimals: number): Promise<PublicKey> {
    return createMint(this.connection, payer, payer.publicKey, null, decimals);
  }

  async mintSpl(
    payer: Keypair,
    mint: PublicKey,
    destinationOwner: PublicKey,
    amount: bigint,
  ): Promise<string> {
    const destination = await getOrCreateAssociatedTokenAccount(
      this.connection,
      payer,
      mint,
      destinationOwner,
    );
    return mintTo(
      this.connection,
      payer,
      mint,
      destination.address,
      payer,
      amount,
    );
  }

  async transferSpl(
    payer: Keypair,
    mint: PublicKey,
    fromOwner: Keypair,
    toOwner: PublicKey,
    amount: bigint,
  ): Promise<string> {
    const source = await getOrCreateAssociatedTokenAccount(
      this.connection,
      payer,
      mint,
      fromOwner.publicKey,
    );
    const destination = await getOrCreateAssociatedTokenAccount(
      this.connection,
      payer,
      mint,
      toOwner,
    );

    return transfer(
      this.connection,
      payer,
      source.address,
      destination.address,
      fromOwner,
      amount,
    );
  }
}
