import { PublicKey, Transaction } from "@solana/web3.js";
import { PROGRAM_ALLOWLIST } from "../config.js";

export class ProgramAllowlist {
  private readonly allowedPrograms: Set<string>;

  constructor(programIds?: string[]) {
    const ids = programIds ?? PROGRAM_ALLOWLIST;
    this.allowedPrograms = new Set(ids);
  }

  isAllowed(programId: PublicKey): boolean {
    if (this.allowedPrograms.size === 0) {
      // Empty allowlist = allow all
      return true;
    }
    return this.allowedPrograms.has(programId.toBase58());
  }

  validateTransaction(tx: Transaction): void {
    if (this.allowedPrograms.size === 0) {
      return;
    }
    for (const instruction of tx.instructions) {
      if (!this.isAllowed(instruction.programId)) {
        throw new Error(
          `Program not allowlisted: ${instruction.programId.toBase58()}`,
        );
      }
    }
  }

  getAllowed(): string[] {
    return Array.from(this.allowedPrograms);
  }
}
