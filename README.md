# Agentic Wallet (Solana Devnet)

Prototype agentic wallet for AI agents on Solana. It can create wallets programmatically, sign transactions, hold SOL/SPL, and run a minimal CLI to manage agents.

## Prerequisites

- Node.js 18+
- Access to Solana devnet

## Setup

```bash
npm install
cp .env.example .env
```

Set `RPC_URL` with your API key and `KEYSTORE_PASSPHRASE` in `.env` before creating wallets.
If your RPC blocks airdrops, set `AIRDROP_RPC_URL` to a public devnet endpoint.

## Commands

```bash
# Create a wallet
npm run cli -- wallet:create -- --name agent-1

# Airdrop SOL on devnet
npm run cli -- wallet:airdrop -- --name agent-1 --sol 1

# Check balance
npm run cli -- wallet:balance -- --name agent-1

# Wait until funds arrive
npm run cli -- wallet:wait-balance -- --name agent-1 --min 0.5 --interval 5000 --timeout 120000

# Create an SPL mint (wallet is mint authority)
npm run cli -- token:create-mint -- --name agent-1 --decimals 6

# Mint SPL tokens to wallet
npm run cli -- token:mint -- --name agent-1 --mint <mint> --amount 10 --decimals 6

# Show SPL balances
npm run cli -- token:balances -- --name agent-1

# Transfer SPL tokens
npm run cli -- token:transfer -- --from agent-1 --to <pubkey> --mint <mint> --amount 1 --decimals 6

# Spawn an agent (creates a wallet + registry entry)
npm run cli -- agent:spawn -- --strategy simple

# List agents
npm run cli -- agent:list

# Run a simple autonomous loop (probabilistic SOL transfers)
npm run cli -- agent:run -- --id <agent-id> --to <pubkey> --sol 0.01 --iterations 5 --interval 3000 --hold 0.6

# Update SPL balance snapshot for an agent
npm run cli -- agent:snapshot -- --id <agent-id>

# Stop a running agent gracefully
npm run cli -- agent:stop -- --id <agent-id>

# Run trading strategy (price-based buy/sell)
npm run cli -- agent:trade -- --id <agent-id> --mint <mint> --buy 0.95 --sell 1.05 --amount 1 --iterations 5 --interval 3000

# Run liquidity strategy (balance rebalancing)
npm run cli -- agent:liquidity -- --id <agent-id> --mint <mint> --min 10 --max 100 --amount 5 --iterations 5 --interval 3000
```

## Web Dashboard

A browser-based dashboard for observing agent wallet actions.

```bash
npm run dashboard
```

Open `http://localhost:3000` in your browser. The dashboard provides:

- **Agent overview**: List of all agents with live SOL balances
- **Spawn agents**: Create new agents with a chosen strategy
- **Fund agents**: Airdrop devnet SOL directly from the UI
- **Agent details**: View wallet address, SPL token balances, and spending usage
- **Auto-refresh**: Updates every 15 seconds

Set `PORT` in `.env` to change the default port (3000).

## Security Features

- **Encrypted key storage**: AES-256-GCM encryption for all keypairs
- **Spending limits**: Per-agent SOL spending limits (configurable via `DEFAULT_SPENDING_LIMIT`)
- **Program allowlist**: Whitelist specific Solana programs (set `PROGRAM_ALLOWLIST` in .env)
- **Kora integration**: Optional gasless transactions via Kora paymaster (set `KORA_RPC_URL`)

## Notes

- Keypairs are encrypted at rest using AES-256-GCM.
- The agent registry is stored in `data/agents.json`.
- `npm audit fix --force` would downgrade `@solana/spl-token` to 0.1.8 (breaking). For now, avoid `--force` and track the upstream fix for `bigint-buffer`.

## Deep Dive

See [docs/DEEP_DIVE.md](docs/DEEP_DIVE.md) for architecture, security, and agent flow details.

## Author

**Musab Mubaraq Mburaimoh (KingMusab)** — [Superteam Profile](https://superteam.fun/earn/t/kingmusab)
