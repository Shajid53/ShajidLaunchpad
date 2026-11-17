# Token Launchpad on Arc Testnet: Architecture and Implementation Plan

Status: proposal only, no code written yet.

## 1. Goals and assumptions

- Chain: Arc Testnet. Gas is paid in USDC (the native view).
- All payments, fees, balances, and prices use the USDC ERC-20 view (6 decimals). The native balance is never shown or summed separately. Contracts never use `msg.value`.
- Addresses, chain IDs, and decimals come from `@/onchain-facts` and `@/onchain-money`, never typed by hand.
- Assumed defaults (all adjustable by the owner):
  - Token creation fee: 1 USDC.
  - Sale fee: 2% (200 bps) of USDC raised on a successful IDO.
  - Bonding curve trade fee: 1% (100 bps).
- The treasury address must be supplied by you at deploy time. The shared platform deployer wallet is never used as the fee recipient.
- No backend in v1. The frontend reads contracts directly (view functions + bounded event scans).

## 2. System overview

```
User wallet
   |
   |-- TokenFactory ------------> LaunchToken (ERC-20, one per creation)
   |        (fee in USDC)
   |
   |-- IDOLaunchpad (fixed price, escrow, vesting, refunds)
   |
   |-- BondingCurveMarket (buy/sell against a curve, USDC reserve)
   |
   '-- Frontend (React + wagmi/viem) reads state, sends txs
```

Three deployable contracts plus one token template:

| Contract | Role | Inherits |
|---|---|---|
| `LaunchToken` | Fixed-supply ERC-20 with custom decimals and metadata | OpenZeppelin `ERC20` |
| `TokenFactory` | Deploys `LaunchToken`, collects the USDC creation fee, keeps a registry | `Ownable`, `ReentrancyGuard` |
| `IDOLaunchpad` | Fixed-price sales: contributions, finalize, claim, vesting, refunds | `Ownable`, `ReentrancyGuard` |
| `BondingCurveMarket` | Bonding curve markets: buy and sell with USDC | `Ownable`, `ReentrancyGuard` |

Design choices:

- One `IDOLaunchpad` and one `BondingCurveMarket` hold all launches in mappings keyed by id. This is cheaper than cloning a contract per launch and gives one address to index and audit.
- Tokens are fixed supply. No mint function exists after creation, so creators cannot inflate supply.
- Every USDC movement goes through `SafeERC20`. Every state-changing external function is `nonReentrant` and follows checks-effects-interactions.
- Pull payments only: investors claim and refund for themselves, so one failing recipient cannot lock anyone else.

## 3. Smart contracts

### 3.1 LaunchToken

- Constructor: `name`, `symbol`, `decimals` (0 to 18), `totalSupply` (in base units), `initialHolder` (the creator), `metadataURI`, `logoURL`.
- Mints the full supply once to the creator. `decimals()` is overridden to return the custom value.
- Stores `metadataURI` and `logoURL` as immutable strings, length-capped by the factory.
- No owner, no mint, no burn privileges. Plain ERC-20 so it composes with anything.

### 3.2 TokenFactory

State: `usdc`, `treasury`, `creationFee`, `launchpad` and `market` allowlist addresses, `allTokens[]`, `tokensByCreator[address]`, `tokenInfo[token]`.

Key functions:

- `createToken(CreateParams)` : validates inputs, pulls `creationFee` USDC from the caller to the treasury via `safeTransferFrom`, deploys `LaunchToken`, records it, emits `TokenCreated`.
- `setCreationFee(uint256)`, `setTreasury(address)` : owner only. Fee is capped (for example at 100 USDC) so the owner cannot set a trap fee.
- `pause()` / `unpause()` : owner only, blocks new creation only.
- Views: `tokenCount()`, `getTokens(offset, limit)`, `getTokensByCreator(creator)`.

Validation: non-empty name and symbol with length caps, `totalSupply > 0`, `decimals <= 18`, URL length caps, and zero-address checks.

Events: `TokenCreated(token, creator, name, symbol, decimals, totalSupply, metadataURI, logoURL)`, `CreationFeeUpdated`, `TreasuryUpdated`.

### 3.3 IDOLaunchpad (fixed-price sale)

Per-launch struct (`Sale`):

- Identity: `creator`, `token`, `tokenDecimals`.
- Pricing: `price` (USDC base units per one whole token), `tokensForSale`.
- Caps: `softCap`, `hardCap`, `minBuy`, `maxBuy` (all USDC base units).
- Timing: `startTime`, `endTime`.
- Vesting: `tgeBps` (percent unlocked at claim start), `cliffSeconds`, `vestingSeconds`. Setting `tgeBps = 10000` means no vesting.
- Accounting: `totalRaised`, `status` (`Upcoming`, `Active`, `Succeeded`, `Failed`, `Cancelled`, derived from time and totals), `finalized`, `claimStart`.
- Mapping `contributions[saleId][user]` and `claimed[saleId][user]`.

Key functions:

- `createSale(SaleParams)` : the creator escrows exactly `hardCap / price` tokens (scaled to token decimals) via `safeTransferFrom`. Checks `softCap <= hardCap`, `minBuy <= maxBuy <= hardCap`, `start > now`, `end > start`, and sane duration bounds. Emits `SaleCreated`.
- `buy(saleId, usdcAmount)` : active window only. Enforces min and max per wallet (cumulative) and clamps nothing silently (reverts if it would exceed the hard cap, or the UI offers the remaining amount). Pulls USDC, updates accounting, emits `Purchased`.
- `finalize(saleId)` : callable by anyone once the sale ended or the hard cap was hit. Sets success if `totalRaised >= softCap`, otherwise failed. On success: takes the platform fee to the treasury, sends the net USDC to the creator, and returns unsold tokens to the creator. Emits `Finalized`.
- `claim(saleId)` : on success, sends the vested portion of `contribution * 10^decimals / price` tokens, minus what was already claimed. Emits `Claimed`.
- `refund(saleId)` : on failed or cancelled sales, returns the caller's USDC contribution. Emits `Refunded`.
- `withdrawCreatorTokens(saleId)` : on failed or cancelled sales, returns the escrowed tokens to the creator.
- `cancelSale(saleId)` : creator, only before `startTime`. Escrow is released back.
- Admin: `setFeeBps` (capped at 10%), `setTreasury`, `pause`/`unpause` (blocks `createSale` and `buy`, never blocks `claim` or `refund`).
- Views: `getSale`, `getSaleStatus`, `getUserPosition(saleId, user)` (contributed, claimable, claimed, refundable), `saleCount`, `getSales(offset, limit)`, `vestedAmount`.

Math rules: tokens owed are computed from the user's USDC contribution, rounding down in favor of the pool. Amounts go through one internal helper so the price scaling by token decimals is defined in exactly one place.

Events: `SaleCreated`, `Purchased`, `Finalized(success, raised, fee)`, `Claimed`, `Refunded`, `SaleCancelled`, `CreatorTokensWithdrawn`, `FeeUpdated`.

### 3.4 BondingCurveMarket

Model: virtual-reserve constant product (`x * y = k`) with a virtual USDC reserve and a virtual token reserve. Price rises smoothly as tokens are bought and falls as they are sold. It is simple, well understood, and always liquid.

Per-market struct (`Market`): `creator`, `token`, `virtualUsdc`, `virtualTokens`, `realUsdcReserve`, `tokensRemaining`, `feeBps`, `graduationTarget`, `graduated` flag, `createdAt`.

Key functions:

- `createMarket(token, tokensForCurve, initialVirtualUsdc, graduationTarget)` : creator escrows the curve's tokens. An optional first buy by the creator can be made in the same flow through a separate `buy` call.
- `buy(marketId, usdcIn, minTokensOut)` : pulls USDC, takes the fee, computes tokens out from the curve, and enforces slippage via `minTokensOut`. Emits `Bought`.
- `sell(marketId, tokensIn, minUsdcOut)` : pulls tokens, computes USDC out from the real reserve, takes the fee, and enforces slippage via `minUsdcOut`. Emits `Sold`.
- `quoteBuy`, `quoteSell`, `currentPrice`, `marketCap`, `progressToGraduation`.
- Graduation: when the real USDC reserve reaches `graduationTarget`, emit `Graduated` and mark the market. On Arc Testnet there is no DEX to migrate liquidity to, so v1 keeps trading open after graduation and treats it as a milestone shown in the UI. LP migration is a documented future step.

Invariants: the real USDC reserve can always cover all sells down to zero tokens outstanding (rounding favors the pool), and fees never come out of the reserve.

Events: `MarketCreated`, `Bought`, `Sold`, `Graduated`, `FeeUpdated`.

## 4. Security plan

- OpenZeppelin `Ownable`, `ReentrancyGuard`, `SafeERC20`, `Pausable` (creation and buying only; exits are never paused).
- Checks-effects-interactions everywhere, plus `nonReentrant` on all USDC and token moving functions.
- Slippage and deadline parameters on every bonding curve trade.
- Owner powers are narrow and capped: fee bps and creation fee have hard maximums, and the owner can never touch escrowed funds or tokens.
- Treat token metadata and logo URLs as untrusted data: length caps onchain, and the UI renders them with a safe image fallback and never as HTML.
- Token-in-escrow check uses balance deltas, so a creator cannot launch a sale with a token that transfers less than expected.
- Same-block and timestamp edge cases covered by tests (start and end boundaries are inclusive and exclusive by definition in one place).
- USDC blacklist risk is acknowledged: because refunds and claims are per-user pulls, a blacklisted address only affects itself.
- Process: Foundry unit tests, fuzz tests on pricing and vesting math, invariant tests on solvency, then a rule-based audit and a functional audit with fixes, then deploy.

## 5. Deployment plan (Arc Testnet)

1. Deploy `TokenFactory` (args: USDC address from the registry, your treasury address, owner, creation fee).
2. Deploy `IDOLaunchpad` and `BondingCurveMarket` (same style of args, plus fee bps).
3. Wire addresses into `.env` as `VITE_` keys and into `AGENTS.md`.
4. Export ABIs for the frontend.
5. Fund a test wallet with the sidebar "Get test USDC" button and run an end-to-end pass.

## 6. Frontend

Stack: React, Tailwind, wagmi v2 + ConnectKit, viem, TanStack Query, shared Arc Studio design system.

### Pages

| Route | Purpose |
|---|---|
| `/` Explore | Tabs for Upcoming, Live, Ended, Bonding Curve. Search, sort (newest, most funded, ending soon), and launch cards with a progress bar |
| `/launch/:type/:id` Detail | Token info, live progress (raised, soft and hard cap markers), countdown, buy panel, user position, claim and refund buttons, vesting schedule, activity feed |
| `/create-token` Token Factory | Form (name, symbol, supply, decimals, metadata, logo URL), live preview, fee summary, approve then create |
| `/create-launch` Launch wizard | Step 1 pick token. Step 2 choose Fixed-Price or Bonding Curve. Step 3 parameters with validation. Step 4 review, approve tokens, create |
| `/portfolio` | My tokens, my launches, my contributions, claimable and refundable amounts |
| `/admin` (owner only) | Fees, treasury, pause switches |

### Components

- Layout: `Header` (wallet, network guard, USDC balance in the ERC-20 view), `NetworkGuard` (prompts a switch to Arc Testnet), `TxToast`.
- Launch browsing: `LaunchCard`, `LaunchFilters`, `StatusBadge`, `FundingProgressBar` (soft cap marker), `Countdown`.
- Trading: `BuyPanel` (amount input, MAX, min and max hints, token estimate), `BondingCurveTradePanel` (buy and sell tabs, slippage setting, price impact), `PriceChart` (price from `Bought` and `Sold` events).
- Position: `PositionCard`, `ClaimButton`, `RefundButton`, `VestingTimeline`.
- Creation: `TokenForm`, `FixedPriceForm`, `CurveForm`, `ApproveAndSubmitButton` (two-step approve then action, with clear state for each).
- Shared: `TokenAvatar` (logo with fallback), `AddressChip` (explorer link), `AmountInput` (USDC, 6 decimals).

### Hooks and data

- `useUsdc` (balance, allowance, approve), `useLaunchList` (paged view reads with multicall), `useLaunch(id)` (polls while active), `useUserPosition`, `useLaunchEvents` (bounded `getLogs` from the deploy block or a recent lookback, with a visible "indexing progress" state), `useCreateToken`, `useCreateSale`, `useBuy`, `useClaim`, `useRefund`.
- Money handling only through the shared money helpers. Every amount label states it is USDC.
- All state is derived from chain reads. No simulated balances, hashes, or progress.

## 7. Build phases

1. Contracts: `LaunchToken` and `TokenFactory`, with tests.
2. Contracts: `IDOLaunchpad` (sales, vesting, refunds), with tests and fuzzing.
3. Contracts: `BondingCurveMarket`, with tests and invariants.
4. Audit pass and fixes, then deploy to Arc Testnet.
5. Frontend: shell, wallet, network guard, Explore and Detail pages.
6. Frontend: create token and create launch flows.
7. Frontend: buy, claim, refund, bonding trade, and portfolio.
8. End-to-end verification on testnet from traces and contract reads, then polish.

## 8. Risks and open decisions

- Fees and caps above are defaults. Tell me if you want different numbers.
- Treasury address: please provide one before deploy.
- Graduation to a DEX is out of scope on testnet; the milestone is shown but liquidity is not migrated.
- Without a backend indexer, large launch counts rely on paged view reads. This is fine for testnet volume and can be swapped for an indexer later.
