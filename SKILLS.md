# Skills

## wallet:create

Creates a new Solana keypair and stores it securely.

## wallet:sign

Signs Solana transactions using a stored keypair.

## wallet:balance

Returns SOL balance for a given wallet.

## token:transfer

Transfers SOL to a destination address.

## token:balances

Returns SPL token balances for a wallet.

## token:create-mint

Creates a new SPL token mint on devnet.

## token:mint

Mints SPL tokens to a wallet's associated token account.

## token:transfer-spl

Transfers SPL tokens to a destination address.

## agent:spawn

Creates a new agent with an isolated wallet.

## agent:list

Lists known agents and their wallets.

## agent:run

Runs a simple autonomous loop that probabilistically transfers SOL.

## agent:snapshot

Updates and returns the SPL balance snapshot for an agent.

## agent:stop

Gracefully stops a running agent and emits shutdown events.

## agent:trade

Runs a price-based trading strategy: buys when price drops below threshold, sells when above.

## agent:liquidity

Runs a liquidity rebalancing strategy: adds when balance is low, removes when high.

## security:spending-limit

Enforces per-agent spending limits to prevent runaway costs.

## security:program-allowlist

Validates transactions against a program ID allowlist.

## gasless:kora

Optionally sponsors transaction fees via Kora paymaster integration.
