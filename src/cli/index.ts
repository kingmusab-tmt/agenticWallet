import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { WalletService } from "../wallet/WalletService.js";
import { TokenService } from "../tokens/TokenService.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";
import { sleep } from "../utils/sleep.js";

const program = new Command();

const parseNumber = (value: string): number => Number(value);
const toBaseUnits = (amount: number, decimals?: number): bigint => {
  if (decimals === undefined) {
    return BigInt(Math.round(amount));
  }
  return BigInt(Math.round(amount * 10 ** decimals));
};

program
  .name("agentic-wallet")
  .description("CLI for agentic wallet prototype")
  .version("0.1.0");

program
  .command("wallet:create")
  .requiredOption("-n, --name <name>", "Wallet name")
  .action(async ({ name }) => {
    const walletService = new WalletService();
    const wallet = await walletService.createWallet(name);
    console.log(
      JSON.stringify({ name, publicKey: wallet.publicKey.toBase58() }, null, 2),
    );
  });

program
  .command("wallet:balance")
  .requiredOption("-n, --name <name>", "Wallet name")
  .action(async ({ name }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(name);
    const balance = await tokenService.getSolBalance(wallet.publicKey);
    console.log(JSON.stringify({ name, balanceSol: balance }, null, 2));
  });

program
  .command("wallet:wait-balance")
  .requiredOption("-n, --name <name>", "Wallet name")
  .option("-m, --min <sol>", "Minimum SOL", parseNumber, 0.5)
  .option("-i, --interval <ms>", "Polling interval in ms", parseNumber, 5000)
  .option("-t, --timeout <ms>", "Timeout in ms", parseNumber, 120000)
  .action(async ({ name, min, interval, timeout }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(name);
    const deadline = Date.now() + Math.max(timeout, 0);

    while (true) {
      const balance = await tokenService.getSolBalance(wallet.publicKey);
      console.log(JSON.stringify({ name, balanceSol: balance }, null, 2));
      if (balance >= min) {
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timeout waiting for balance >= ${min} SOL.`);
      }
      await sleep(interval);
    }
  });

program
  .command("wallet:airdrop")
  .requiredOption("-n, --name <name>", "Wallet name")
  .requiredOption("-s, --sol <sol>", "Amount of SOL", parseNumber)
  .action(async ({ name, sol }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(name);
    const signature = await tokenService.requestAirdrop(wallet.publicKey, sol);
    console.log(JSON.stringify({ name, signature }, null, 2));
  });

program
  .command("token:balances")
  .requiredOption("-n, --name <name>", "Wallet name")
  .action(async ({ name }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(name);
    const balances = await tokenService.getSplBalances(wallet.publicKey);
    console.log(JSON.stringify({ name, spl: balances }, null, 2));
  });

program
  .command("token:create-mint")
  .requiredOption("-n, --name <name>", "Wallet name")
  .option("-d, --decimals <decimals>", "Decimals", parseNumber, 6)
  .action(async ({ name, decimals }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(name);
    const mint = await tokenService.createSplMint(wallet, decimals);
    console.log(
      JSON.stringify({ name, mint: mint.toBase58(), decimals }, null, 2),
    );
  });

program
  .command("token:mint")
  .requiredOption("-n, --name <name>", "Wallet name")
  .requiredOption("-m, --mint <mint>", "Mint address")
  .requiredOption("-a, --amount <amount>", "Amount", parseNumber)
  .option("-d, --decimals <decimals>", "Decimals", parseNumber)
  .action(async ({ name, mint, amount, decimals }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(name);
    const signature = await tokenService.mintSpl(
      wallet,
      new PublicKey(mint),
      wallet.publicKey,
      toBaseUnits(amount, decimals),
    );
    console.log(JSON.stringify({ name, mint, signature }, null, 2));
  });

program
  .command("token:transfer")
  .requiredOption("-f, --from <name>", "Wallet name")
  .requiredOption("-t, --to <pubkey>", "Destination pubkey")
  .requiredOption("-m, --mint <mint>", "Mint address")
  .requiredOption("-a, --amount <amount>", "Amount", parseNumber)
  .option("-d, --decimals <decimals>", "Decimals", parseNumber)
  .action(async ({ from, to, mint, amount, decimals }) => {
    const walletService = new WalletService();
    const tokenService = new TokenService(walletService.getConnection());
    const wallet = await walletService.loadWallet(from);
    const signature = await tokenService.transferSpl(
      wallet,
      new PublicKey(mint),
      wallet,
      new PublicKey(to),
      toBaseUnits(amount, decimals),
    );
    console.log(JSON.stringify({ from, to, mint, signature }, null, 2));
  });

program
  .command("agent:spawn")
  .requiredOption("-s, --strategy <strategy>", "Strategy name")
  .option("-n, --name <name>", "Wallet name")
  .action(async ({ strategy, name }) => {
    const orchestrator = new Orchestrator();
    const record = await orchestrator.spawnAgent(strategy, name);
    console.log(JSON.stringify(record, null, 2));
  });

program.command("agent:list").action(async () => {
  const orchestrator = new Orchestrator();
  const agents = await orchestrator.listAgents();
  console.table(agents);
});

program
  .command("agent:balance")
  .requiredOption("-i, --id <id>", "Agent id")
  .action(async ({ id }) => {
    const orchestrator = new Orchestrator();
    const balance = await orchestrator.getAgentBalance(id);
    console.log(JSON.stringify({ id, balanceSol: balance }, null, 2));
  });

program
  .command("agent:fund")
  .requiredOption("-i, --id <id>", "Agent id")
  .requiredOption("-s, --sol <sol>", "Amount of SOL", parseNumber)
  .action(async ({ id, sol }) => {
    const orchestrator = new Orchestrator();
    const signature = await orchestrator.fundAgent(id, sol);
    console.log(JSON.stringify({ id, signature }, null, 2));
  });

program
  .command("agent:run")
  .requiredOption("-i, --id <id>", "Agent id")
  .requiredOption("-t, --to <pubkey>", "Destination pubkey")
  .requiredOption("-s, --sol <sol>", "Amount of SOL", parseNumber)
  .option("-n, --iterations <count>", "Number of iterations", parseNumber, 5)
  .option("-m, --interval <ms>", "Interval in ms", parseNumber, 3000)
  .option("-p, --hold <prob>", "Hold probability (0-1)", parseNumber, 0.6)
  .action(async ({ id, to, sol, iterations, interval, hold }) => {
    const orchestrator = new Orchestrator();
    const signatures = await orchestrator.runAgentLoop(id, {
      to: new PublicKey(to),
      sol,
      iterations,
      intervalMs: interval,
      holdProbability: hold,
    });
    console.log(JSON.stringify({ id, signatures }, null, 2));
  });

program
  .command("agent:snapshot")
  .requiredOption("-i, --id <id>", "Agent id")
  .action(async ({ id }) => {
    const orchestrator = new Orchestrator();
    await orchestrator.updateSplSnapshot(id);
    const agent = await orchestrator.getAgent(id);
    console.log(
      JSON.stringify(
        {
          id,
          splBalances: agent?.splBalances,
          lastUpdated: agent?.lastUpdated,
        },
        null,
        2,
      ),
    );
  });

program
  .command("agent:stop")
  .requiredOption("-i, --id <id>", "Agent id")
  .action(async ({ id }) => {
    const orchestrator = new Orchestrator();
    await orchestrator.stopAgent(id);
    console.log(JSON.stringify({ id, status: "stopped" }, null, 2));
  });

program
  .command("agent:trade")
  .requiredOption("-i, --id <id>", "Agent id")
  .requiredOption("-m, --mint <mint>", "Target mint address")
  .option("-b, --buy <threshold>", "Buy threshold", parseNumber, 0.95)
  .option("-s, --sell <threshold>", "Sell threshold", parseNumber, 1.05)
  .option("-a, --amount <amount>", "Trade amount", parseNumber, 1.0)
  .option("-n, --iterations <count>", "Number of iterations", parseNumber, 5)
  .option("-t, --interval <ms>", "Interval in ms", parseNumber, 3000)
  .action(async ({ id, mint, buy, sell, amount, iterations, interval }) => {
    const orchestrator = new Orchestrator();
    const signatures = await orchestrator.runTradingAgent(id, {
      targetMint: new PublicKey(mint),
      buyThreshold: buy,
      sellThreshold: sell,
      tradeAmount: amount,
      iterations,
      intervalMs: interval,
    });
    console.log(
      JSON.stringify({ id, strategy: "trading", signatures }, null, 2),
    );
  });

program
  .command("agent:liquidity")
  .requiredOption("-i, --id <id>", "Agent id")
  .requiredOption("-m, --mint <mint>", "Pool mint address")
  .option("--min <balance>", "Min balance", parseNumber, 10)
  .option("--max <balance>", "Max balance", parseNumber, 100)
  .option("-a, --amount <amount>", "Rebalance amount", parseNumber, 5)
  .option("-n, --iterations <count>", "Number of iterations", parseNumber, 5)
  .option("-t, --interval <ms>", "Interval in ms", parseNumber, 3000)
  .action(async ({ id, mint, min, max, amount, iterations, interval }) => {
    const orchestrator = new Orchestrator();
    const signatures = await orchestrator.runLiquidityAgent(id, {
      poolMint: new PublicKey(mint),
      minBalance: min,
      maxBalance: max,
      rebalanceAmount: amount,
      iterations,
      intervalMs: interval,
    });
    console.log(
      JSON.stringify({ id, strategy: "liquidity", signatures }, null, 2),
    );
  });

program.parseAsync();
