import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AGENT_STORE, DEFAULT_SPENDING_LIMIT } from "../config.js";
import { AgentRecord } from "../agents/Agent.js";
import { WalletService } from "../wallet/WalletService.js";
import { TokenService } from "../tokens/TokenService.js";
import { SimpleAgentRunner } from "../agents/SimpleAgentRunner.js";
import { TradingAgent } from "../agents/TradingAgent.js";
import { LiquidityAgent } from "../agents/LiquidityAgent.js";
import { EventBus } from "./EventBus.js";
import { PublicKey } from "@solana/web3.js";

type RunningAgent = {
  id: string;
  runner: SimpleAgentRunner | TradingAgent | LiquidityAgent;
};

export class Orchestrator {
  private readonly walletService: WalletService;
  private readonly tokenService: TokenService;
  private readonly storePath: string;
  private readonly eventBus: EventBus;
  private readonly runningAgents: Map<string, RunningAgent> = new Map();

  constructor(walletService?: WalletService, eventBus?: EventBus) {
    this.walletService = walletService ?? new WalletService();
    this.tokenService = new TokenService(this.walletService.getConnection());
    this.storePath = AGENT_STORE;
    this.eventBus = eventBus ?? new EventBus();
  }

  async spawnAgent(
    strategy: string,
    walletName?: string,
    spendingLimit?: number,
  ): Promise<AgentRecord> {
    const name = walletName ?? `agent-${Date.now()}`;
    const wallet = await this.walletService.createWallet(name);
    const record: AgentRecord = {
      id: randomUUID(),
      walletName: name,
      walletAddress: wallet.publicKey.toBase58(),
      strategy,
      createdAt: new Date().toISOString(),
      solSpent: 0,
      spendingLimit: spendingLimit ?? DEFAULT_SPENDING_LIMIT,
      lastUpdated: new Date().toISOString(),
    };
    const all = await this.readAgents();
    all.push(record);
    await this.writeAgents(all);

    this.eventBus.emit("agent_spawned", {
      id: record.id,
      strategy: record.strategy,
      walletAddress: record.walletAddress,
    });

    return record;
  }

  async promoteWallet(
    walletName: string,
    strategy: string,
    spendingLimit?: number,
  ): Promise<AgentRecord> {
    // Check if already registered
    const all = await this.readAgents();
    const existing = all.find((a) => a.walletName === walletName);
    if (existing) {
      throw new Error(
        `Wallet "${walletName}" is already registered as agent ${existing.id}`,
      );
    }

    // Load existing wallet (will throw if not found)
    const wallet = await this.walletService.loadWallet(walletName);
    const record: AgentRecord = {
      id: randomUUID(),
      walletName,
      walletAddress: wallet.publicKey.toBase58(),
      strategy,
      createdAt: new Date().toISOString(),
      solSpent: 0,
      spendingLimit: spendingLimit ?? DEFAULT_SPENDING_LIMIT,
      lastUpdated: new Date().toISOString(),
    };
    all.push(record);
    await this.writeAgents(all);

    this.eventBus.emit("agent_spawned", {
      id: record.id,
      strategy: record.strategy,
      walletAddress: record.walletAddress,
    });

    return record;
  }

  async stopAgent(id: string): Promise<void> {
    const running = this.runningAgents.get(id);
    if (running) {
      if (
        "stop" in running.runner &&
        typeof running.runner.stop === "function"
      ) {
        running.runner.stop();
      }
      this.runningAgents.delete(id);
      this.eventBus.emit("agent_stopped", { id });
    }

    const record = await this.getAgent(id);
    if (record) {
      record.lastUpdated = new Date().toISOString();
      await this.updateAgent(record);
    }
  }

  isRunning(id: string): boolean {
    return this.runningAgents.has(id);
  }

  async listAgents(): Promise<AgentRecord[]> {
    return this.readAgents();
  }

  async getAgent(id: string): Promise<AgentRecord | undefined> {
    const all = await this.readAgents();
    return all.find((agent) => agent.id === id);
  }

  async getAgentBalance(id: string): Promise<number> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }
    const wallet = await this.walletService.loadWallet(record.walletName);
    return this.tokenService.getSolBalance(wallet.publicKey);
  }

  async fundAgent(id: string, sol: number): Promise<string> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }
    const wallet = await this.walletService.loadWallet(record.walletName);
    return this.tokenService.requestAirdrop(wallet.publicKey, sol);
  }

  async runAgentLoop(
    id: string,
    options: {
      to: PublicKey;
      sol: number;
      iterations?: number;
      intervalMs?: number;
      holdProbability?: number;
    },
  ): Promise<string[]> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }

    const wallet = await this.walletService.loadWallet(record.walletName);
    const runner = new SimpleAgentRunner(this.tokenService);
    const iterations = options.iterations ?? 5;
    const intervalMs = options.intervalMs ?? 3000;
    const holdProbability = Math.min(
      Math.max(options.holdProbability ?? 0.6, 0),
      1,
    );

    this.runningAgents.set(id, { id, runner });
    this.eventBus.emit("agent_started", { id, strategy: "simple_transfer" });

    const signatures = await runner.runSolTransferLoop(wallet, {
      to: options.to,
      sol: options.sol,
      iterations,
      intervalMs,
      holdProbability,
    });

    this.runningAgents.delete(id);
    this.eventBus.emit("agent_completed", { id, signatures });

    return signatures;
  }

  async runTradingAgent(
    id: string,
    options: {
      targetMint: PublicKey;
      buyThreshold?: number;
      sellThreshold?: number;
      tradeAmount?: number;
      iterations?: number;
      intervalMs?: number;
    },
  ): Promise<string[]> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }

    const wallet = await this.walletService.loadWallet(record.walletName);
    const agent = new TradingAgent(this.tokenService);

    this.runningAgents.set(id, { id, runner: agent });
    this.eventBus.emit("agent_started", { id, strategy: "trading" });

    const signatures = await agent.run(wallet, {
      targetMint: options.targetMint,
      buyThreshold: options.buyThreshold ?? 0.95,
      sellThreshold: options.sellThreshold ?? 1.05,
      tradeAmount: options.tradeAmount ?? 1.0,
      iterations: options.iterations ?? 5,
      intervalMs: options.intervalMs ?? 3000,
    });

    this.runningAgents.delete(id);
    this.eventBus.emit("agent_completed", { id, signatures });

    return signatures;
  }

  async runLiquidityAgent(
    id: string,
    options: {
      poolMint: PublicKey;
      minBalance?: number;
      maxBalance?: number;
      rebalanceAmount?: number;
      iterations?: number;
      intervalMs?: number;
    },
  ): Promise<string[]> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }

    const wallet = await this.walletService.loadWallet(record.walletName);
    const agent = new LiquidityAgent(this.tokenService);

    this.runningAgents.set(id, { id, runner: agent });
    this.eventBus.emit("agent_started", { id, strategy: "liquidity" });

    const signatures = await agent.run(wallet, {
      poolMint: options.poolMint,
      minBalance: options.minBalance ?? 10,
      maxBalance: options.maxBalance ?? 100,
      rebalanceAmount: options.rebalanceAmount ?? 5,
      iterations: options.iterations ?? 5,
      intervalMs: options.intervalMs ?? 3000,
    });

    this.runningAgents.delete(id);
    this.eventBus.emit("agent_completed", { id, signatures });

    return signatures;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  async updateSplSnapshot(id: string): Promise<void> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }
    const wallet = await this.walletService.loadWallet(record.walletName);
    const balances = await this.tokenService.getSplBalances(wallet.publicKey);
    record.splBalances = balances;
    record.lastUpdated = new Date().toISOString();
    await this.updateAgent(record);
  }

  async trackSpending(id: string, sol: number): Promise<void> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }
    const spent = (record.solSpent ?? 0) + sol;
    const limit = record.spendingLimit ?? DEFAULT_SPENDING_LIMIT;
    if (spent > limit) {
      throw new Error(
        `Spending limit exceeded: ${spent.toFixed(4)} > ${limit.toFixed(4)} SOL`,
      );
    }
    record.solSpent = spent;
    record.lastUpdated = new Date().toISOString();
    await this.updateAgent(record);
  }

  async checkSpendingLimit(id: string, sol: number): Promise<void> {
    const record = await this.getAgent(id);
    if (!record) {
      throw new Error(`Agent not found: ${id}`);
    }
    const spent = (record.solSpent ?? 0) + sol;
    const limit = record.spendingLimit ?? DEFAULT_SPENDING_LIMIT;
    if (spent > limit) {
      throw new Error(
        `Operation would exceed spending limit: ${spent.toFixed(4)} > ${limit.toFixed(4)} SOL`,
      );
    }
  }

  private async updateAgent(record: AgentRecord): Promise<void> {
    const all = await this.readAgents();
    const index = all.findIndex((a) => a.id === record.id);
    if (index === -1) {
      throw new Error(`Agent not found: ${record.id}`);
    }
    all[index] = record;
    await this.writeAgents(all);
  }

  private async readAgents(): Promise<AgentRecord[]> {
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      return JSON.parse(raw) as AgentRecord[];
    } catch {
      return [];
    }
  }

  private async writeAgents(records: AgentRecord[]): Promise<void> {
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.storePath,
      JSON.stringify(records, null, 2),
      "utf8",
    );
  }
}
