import { Keypair, PublicKey } from "@solana/web3.js";
import { TokenService } from "../tokens/TokenService.js";
import { sleep } from "../utils/sleep.js";

export type TradingConfig = {
  targetMint: PublicKey;
  buyThreshold: number;
  sellThreshold: number;
  tradeAmount: number;
  iterations: number;
  intervalMs: number;
};

/**
 * TradingAgent simulates a simple price-based trading strategy.
 * In a real scenario, it would fetch prices and make buy/sell decisions.
 * For this demo, it simulates trades based on a mock price feed.
 */
export class TradingAgent {
  private running = false;

  constructor(private readonly tokenService: TokenService) {}

  async run(wallet: Keypair, config: TradingConfig): Promise<string[]> {
    this.running = true;
    const signatures: string[] = [];
    let mockPrice = 1.0;

    for (let i = 0; i < config.iterations && this.running; i += 1) {
      // Simulate price fluctuation
      mockPrice *= 0.95 + Math.random() * 0.1; // +/- 5% random walk

      const decision = this.evaluateMarket(mockPrice, config);

      if (decision.action === "BUY") {
        // In a real implementation, this would execute a swap on a DEX
        // For demo, we'll mint tokens to simulate a buy
        try {
          const sig = await this.tokenService.mintSpl(
            wallet,
            config.targetMint,
            wallet.publicKey,
            BigInt(Math.round(config.tradeAmount * 1e6)),
          );
          signatures.push(sig);
        } catch (error) {
          // Mint may fail if wallet doesn't own the mint authority
          console.error("Trade execution failed:", error);
        }
      } else if (decision.action === "SELL") {
        // In a real implementation, this would execute a swap on a DEX
        // For demo, we'll transfer tokens to simulate a sell
        try {
          const balances = await this.tokenService.getSplBalances(
            wallet.publicKey,
          );
          const balance = balances.find(
            (b) => b.mint === config.targetMint.toBase58(),
          );
          if (balance && parseFloat(balance.amount) > 0) {
            const amount = Math.min(
              parseFloat(balance.amount),
              config.tradeAmount,
            );
            // Transfer to a burn address to simulate selling
            const burnAddress = new PublicKey(
              "1111111111111111111111111111111111111111111",
            );
            const sig = await this.tokenService.transferSpl(
              wallet,
              config.targetMint,
              wallet,
              burnAddress,
              BigInt(Math.round(amount * 1e6)),
            );
            signatures.push(sig);
          }
        } catch (error) {
          console.error("Trade execution failed:", error);
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

  private evaluateMarket(
    price: number,
    config: TradingConfig,
  ): { action: "BUY" | "SELL" | "HOLD"; reason: string } {
    if (price < config.buyThreshold) {
      return {
        action: "BUY",
        reason: `Price ${price.toFixed(4)} below buy threshold`,
      };
    }
    if (price > config.sellThreshold) {
      return {
        action: "SELL",
        reason: `Price ${price.toFixed(4)} above sell threshold`,
      };
    }
    return {
      action: "HOLD",
      reason: `Price ${price.toFixed(4)} in neutral zone`,
    };
  }
}
