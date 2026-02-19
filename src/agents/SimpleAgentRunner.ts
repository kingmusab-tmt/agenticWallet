import { Keypair, PublicKey } from "@solana/web3.js";
import { TokenService } from "../tokens/TokenService.js";
import { sleep } from "../utils/sleep.js";

export type AgentLoopOptions = {
  to: PublicKey;
  sol: number;
  iterations: number;
  intervalMs: number;
  holdProbability: number;
};

export class SimpleAgentRunner {
  constructor(private readonly tokenService: TokenService) {}

  async runSolTransferLoop(
    wallet: Keypair,
    options: AgentLoopOptions,
  ): Promise<string[]> {
    const signatures: string[] = [];

    for (let i = 0; i < options.iterations; i += 1) {
      const roll = Math.random();
      if (roll >= options.holdProbability) {
        const signature = await this.tokenService.transferSol(
          wallet,
          options.to,
          options.sol,
        );
        signatures.push(signature);
      }
      if (options.intervalMs > 0 && i < options.iterations - 1) {
        await sleep(options.intervalMs);
      }
    }

    return signatures;
  }
}
