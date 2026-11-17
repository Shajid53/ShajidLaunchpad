# Arc Token Launchpad

A token launchpad for Arc Testnet. Creators launch an ERC-20 token and a fixed-price USDC sale in one step. Investors contribute USDC, then claim tokens if the sale reaches its soft cap or get a refund if it does not.

Built with [Arc Studio](https://studio.arc.io)

## App features

- Connect an EVM wallet and see your Arc Testnet status and live USDC balance, with a link to the test USDC faucet.
- Explore launches with All, Live, Upcoming and Ended filters, funding progress bars and countdowns.
- Create a launch in three steps: token details, sale settings, then review with USDC fee approval and deployment.
- Launch pages with tokenomics, explorer links, a buy box (approve, then contribute), and your own position with claim tokens or claim refund.
- Anyone can finalize an ended sale and trigger the creator and platform fee payouts.

## What is included

- A token contract with custom name, symbol, decimals and supply.
- A factory that deploys the token and its sale pool, charges a USDC creation fee, and keeps a registry of every launch.
- A sale pool with soft and hard caps, per-wallet min and max contributions, start and end times, token claims, refunds, and separate creator and platform fee withdrawals.

## Tech stack

Solidity 0.8.28, Foundry, OpenZeppelin Contracts. Frontend: React, Vite, TypeScript, Tailwind CSS, wagmi, viem.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run contracts:build   # compile contracts
bun run contracts:test    # run the Foundry test suite
bun run dev               # start the app
```

## Environment variables

None.
