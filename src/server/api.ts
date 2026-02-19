import { Router, Request, Response } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import { WalletService } from "../wallet/WalletService.js";
import { TokenService } from "../tokens/TokenService.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";

export function apiRouter(): Router {
  const router = Router();
  const walletService = new WalletService();
  const tokenService = new TokenService(walletService.getConnection());
  const orchestrator = new Orchestrator(walletService);

  // ── Agents ────────────────────────────────────────────────

  router.get("/agents", async (_req: Request, res: Response) => {
    try {
      const agents = await orchestrator.listAgents();

      // Attach live SOL balances
      const enriched = await Promise.all(
        agents.map(async (agent) => {
          try {
            const balance = await tokenService.getSolBalance(
              (await walletService.loadWallet(agent.walletName)).publicKey,
            );
            return {
              ...agent,
              balanceSol: balance,
              running: orchestrator.isRunning(agent.id),
            };
          } catch {
            return {
              ...agent,
              balanceSol: null,
              running: orchestrator.isRunning(agent.id),
            };
          }
        }),
      );

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get("/agents/:id", async (req: Request, res: Response) => {
    try {
      const agent = await orchestrator.getAgent(req.params.id as string);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const wallet = await walletService.loadWallet(agent.walletName);
      const balanceSol = await tokenService.getSolBalance(wallet.publicKey);
      const splBalances = await tokenService.getSplBalances(wallet.publicKey);

      res.json({ ...agent, balanceSol, splBalances });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/spawn", async (req: Request, res: Response) => {
    try {
      const { strategy, name, spendingLimit } = req.body ?? {};
      const record = await orchestrator.spawnAgent(
        strategy ?? "simple",
        name,
        spendingLimit,
      );
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/promote", async (req: Request, res: Response) => {
    try {
      const { walletName, strategy, spendingLimit } = req.body ?? {};
      if (!walletName) {
        res.status(400).json({ error: "walletName is required" });
        return;
      }
      const record = await orchestrator.promoteWallet(
        walletName,
        strategy ?? "simple",
        spendingLimit,
      );
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/:id/fund", async (req: Request, res: Response) => {
    try {
      const { sol } = req.body ?? {};
      if (!sol || typeof sol !== "number") {
        res.status(400).json({ error: "sol (number) is required" });
        return;
      }
      const signature = await orchestrator.fundAgent(
        req.params.id as string,
        sol,
      );
      res.json({ signature });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/:id/stop", async (req: Request, res: Response) => {
    try {
      await orchestrator.stopAgent(req.params.id as string);
      res.json({ status: "stopped" });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/:id/snapshot", async (req: Request, res: Response) => {
    try {
      await orchestrator.updateSplSnapshot(req.params.id as string);
      const agent = await orchestrator.getAgent(req.params.id as string);
      res.json({
        splBalances: agent?.splBalances,
        lastUpdated: agent?.lastUpdated,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/:id/run", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { to, sol, iterations, interval, hold } = req.body ?? {};
      const destination = to ? new PublicKey(to) : Keypair.generate().publicKey;
      const signatures = await orchestrator.runAgentLoop(id, {
        to: destination,
        sol,
        iterations: iterations ?? 5,
        intervalMs: interval ?? 3000,
        holdProbability: hold ?? 0.6,
      });
      res.json({ id, signatures });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/:id/trade", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { mint, buy, sell, amount, iterations, interval } = req.body ?? {};
      if (!mint) {
        res.status(400).json({ error: "mint is required" });
        return;
      }
      const signatures = await orchestrator.runTradingAgent(id, {
        targetMint: new PublicKey(mint),
        buyThreshold: buy ?? 0.95,
        sellThreshold: sell ?? 1.05,
        tradeAmount: amount ?? 1.0,
        iterations: iterations ?? 5,
        intervalMs: interval ?? 3000,
      });
      res.json({ id, strategy: "trading", signatures });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/agents/:id/liquidity", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { mint, min, max, amount, iterations, interval } = req.body ?? {};
      if (!mint) {
        res.status(400).json({ error: "mint is required" });
        return;
      }
      const signatures = await orchestrator.runLiquidityAgent(id, {
        poolMint: new PublicKey(mint),
        minBalance: min ?? 10,
        maxBalance: max ?? 100,
        rebalanceAmount: amount ?? 5,
        iterations: iterations ?? 5,
        intervalMs: interval ?? 3000,
      });
      res.json({ id, strategy: "liquidity", signatures });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Wallets ───────────────────────────────────────────────

  router.get("/wallets", async (_req: Request, res: Response) => {
    try {
      const names = await walletService.listWallets();

      const wallets = await Promise.all(
        names.map(async (name) => {
          try {
            const kp = await walletService.loadWallet(name);
            const publicKey = kp.publicKey.toBase58();
            const balanceSol = await tokenService.getSolBalance(kp.publicKey);
            return { name, publicKey, balanceSol };
          } catch {
            return { name, publicKey: null, balanceSol: null };
          }
        }),
      );

      res.json(wallets);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/wallets/create", async (req: Request, res: Response) => {
    try {
      const { name } = req.body ?? {};
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const wallet = await walletService.createWallet(name);
      res.json({ name, publicKey: wallet.publicKey.toBase58() });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get("/wallets/:name/balance", async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const wallet = await walletService.loadWallet(name);
      const balance = await tokenService.getSolBalance(wallet.publicKey);
      res.json({ name, balanceSol: balance });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get(
    "/wallets/:name/spl-balances",
    async (req: Request, res: Response) => {
      try {
        const name = req.params.name as string;
        const wallet = await walletService.loadWallet(name);
        const balances = await tokenService.getSplBalances(wallet.publicKey);
        res.json({ name, spl: balances });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    },
  );

  router.post("/wallets/:name/airdrop", async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const { sol } = req.body ?? {};
      if (!sol || typeof sol !== "number") {
        res.status(400).json({ error: "sol (number) is required" });
        return;
      }
      const wallet = await walletService.loadWallet(name);
      const signature = await tokenService.requestAirdrop(
        wallet.publicKey,
        sol,
      );
      res.json({ name, signature });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Tokens ────────────────────────────────────────────────

  router.post("/tokens/create-mint", async (req: Request, res: Response) => {
    try {
      const { walletName, decimals } = req.body ?? {};
      if (!walletName) {
        res.status(400).json({ error: "walletName is required" });
        return;
      }
      const wallet = await walletService.loadWallet(walletName);
      const mint = await tokenService.createSplMint(wallet, decimals ?? 6);
      res.json({ walletName, mint: mint.toBase58(), decimals: decimals ?? 6 });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/tokens/mint", async (req: Request, res: Response) => {
    try {
      const { walletName, mint, amount, decimals } = req.body ?? {};
      if (!walletName || !mint || amount == null) {
        res
          .status(400)
          .json({ error: "walletName, mint, and amount are required" });
        return;
      }
      const wallet = await walletService.loadWallet(walletName);
      const d = decimals ?? 6;
      const baseUnits = BigInt(Math.round(amount * 10 ** d));
      const signature = await tokenService.mintSpl(
        wallet,
        new PublicKey(mint),
        wallet.publicKey,
        baseUnits,
      );
      res.json({ walletName, mint, amount, signature });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/tokens/transfer", async (req: Request, res: Response) => {
    try {
      const { fromWallet, to, mint, amount, decimals } = req.body ?? {};
      if (!fromWallet || !to || !mint || amount == null) {
        res
          .status(400)
          .json({ error: "fromWallet, to, mint, and amount are required" });
        return;
      }
      const wallet = await walletService.loadWallet(fromWallet);
      const d = decimals ?? 6;
      const baseUnits = BigInt(Math.round(amount * 10 ** d));
      const signature = await tokenService.transferSpl(
        wallet,
        new PublicKey(mint),
        wallet,
        new PublicKey(to),
        baseUnits,
      );
      res.json({ fromWallet, to, mint, amount, signature });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ── Health ────────────────────────────────────────────────

  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const version = await walletService.getConnection().getVersion();
      res.json({ status: "ok", solana: version });
    } catch (error) {
      res.json({ status: "degraded", error: String(error) });
    }
  });

  return router;
}
