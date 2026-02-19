import { Keypair, PublicKey } from "@solana/web3.js";
import { TokenService } from "../tokens/TokenService.js";
import { sleep } from "../utils/sleep.js";

export type LiquidityConfig = {
  poolMint: PublicKey;
  minBalance: number;
  maxBalance: number;
  rebalanceAmount: number;
  iterations: number;
  intervalMs: number;
};

/**
 * LiquidityAgent simulates a liquidity provider that monitors
 * token balances and rebalances when they drift outside a target range.
 */
export class LiquidityAgent {
  private running = false;

  constructor(private readonly tokenService: TokenService) {}

  async run(wallet: Keypair, config: LiquidityConfig): Promise<string[]> {
    this.running = true;
    const signatures: string[] = [];

    for (let i = 0; i < config.iterations && this.running; i += 1) {
      const balances = await this.tokenService.getSplBalances(wallet.publicKey);
      const balance = balances.find(
        (b) => b.mint === config.poolMint.toBase58(),
      );
      const currentBalance = balance ? parseFloat(balance.amount) : 0;

      const decision = this.evaluateBalance(currentBalance, config);

      if (decision.action === "ADD_LIQUIDITY") {
        // Simulate adding liquidity by minting tokens
        try {
          const sig = await this.tokenService.mintSpl(
            wallet,
            config.poolMint,
            wallet.publicKey,
            BigInt(Math.round(config.rebalanceAmount * 1e6)),
          );
          signatures.push(sig);
        } catch (error) {
          console.error("Add liquidity failed:", error);
        }
      } else if (decision.action === "REMOVE_LIQUIDITY") {
        // Simulate removing liquidity by transferring/burning tokens
        if (currentBalance > 0) {
          try {
            const amount = Math.min(currentBalance, config.rebalanceAmount);
            const burnAddress = new PublicKey(
              "1111111111111111111111111111111111111111111",
            );
            const sig = await this.tokenService.transferSpl(
              wallet,
              config.poolMint,
              wallet,
              burnAddress,
              BigInt(Math.round(amount * 1e6)),
            );
            signatures.push(sig);
          } catch (error) {
            console.error("Remove liquidity failed:", error);
          }
        }
      }

      if (config.intervalMs > 0 && i < config.iterations - 1 && this.running) {
        await sleep(config.intervalMs);
      }
    }

    return signatures;
  }

  stop(): void {
    this.running = false;
  }

  private evaluateBalance(
    balance: number,
    config: LiquidityConfig,
  ): { action: "ADD_LIQUIDITY" | "REMOVE_LIQUIDITY" | "HOLD"; reason: string } {
    if (balance < config.minBalance) {
      return {
        action: "ADD_LIQUIDITY",
        reason: `Balance ${balance.toFixed(2)} below min ${config.minBalance}`,
      };
    }
    if (balance > config.maxBalance) {
      return {
        action: "REMOVE_LIQUIDITY",
        reason: `Balance ${balance.toFixed(2)} above max ${config.maxBalance}`,
      };
    }
    return {
      action: "HOLD",
      reason: `Balance ${balance.toFixed(2)} within target range`,
    };
  }
}
