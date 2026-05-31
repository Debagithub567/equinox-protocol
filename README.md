Overview
Perpetual futures funding rates on Solana consistently generate 20–50% APY. Until now, capturing this yield required professional-grade delta-neutral trading — managing leveraged short positions, hedge ratios, margin requirements, and liquidation risk.
Equinox abstracts the entire strategy into three steps: deposit, hold, redeem.
Users deposit SOL and receive sUSD — a synthetic dollar-denominated token that automatically accrues yield based on real-time funding rates sourced from Drift Protocol. No trading. No leverage. No liquidation risk. Fully non-custodial.

How It Works
User deposits SOL
       │
       ▼
Smart Contract queries Pyth oracle (live SOL/USD price)
       │
       ▼
sUSD minted to user's wallet (exact dollar value)
       │
       ▼
Keeper Bot reads Drift SOL-PERP funding rate every 60s
       │
       ▼
On-chain APY updated → sUSD balance accrues continuously
       │
       ▼
User redeems sUSD → SOL returned at live oracle price

Live Metrics (Devnet)
MetricValueCurrent APY50.00%Drift SOL-PERP Funding Rate2.35%/hrSmart ContractCDN8JEfQibSy7RTzJacy8eXHrVTpGFTXmCqGAiZqASZ5NetworkSolana Devnet

Architecture
Smart Contract (Rust / Anchor)
Four on-chain instructions:
InstructionDescriptioninitializeVaultOne-time setup. Creates vault config PDA, initializes sUSD mint via Token-2022.depositAsset(amount_lamports)Accepts SOL, queries Pyth oracle, mints sUSD at current price. SOL locked in PDA vault.redeemAsset(susd_amount)Burns sUSD, calculates SOL equivalent at live oracle price, transfers SOL to user.updateProtocolRate(new_rate_bps)Restricted to keeper keypair. Updates on-chain APY every 60 seconds.
Key design decisions:

Token-2022 over legacy SPL Token — supports transfer hooks and confidential transfers for future extensibility
PDAs for all accounts — no admin can unilaterally withdraw user funds
Pyth pull oracle — sub-second price updates with confidence intervals, no stale price risk

Keeper Bot (Node.js)
Runs every 60 seconds:

Reads lastFundingRate from Drift SOL-PERP market (market index 0) via @drift-labs/sdk
Annualizes the hourly rate
Clamps between 100 BPS (1%) and 5000 BPS (50%)
Submits updateProtocolRate transaction on-chain

Frontend (Next.js 16 / React 19)

Wallet connectivity via @solana/wallet-adapter (Phantom, Brave, any Wallet Standard wallet)
Live balance display using continuous compounding: balance = principal × e^(r × t)
UI updates every 100ms; on-chain state polled every 15 seconds
Built with Tailwind CSS v4, dark-mode-first


What's Real vs. Simulated
Full transparency on current devnet build:
Real (On-Chain, Verifiable)

SOL balance — fetched via getBalance() RPC call
sUSD token balance — fetched via getTokenAccountBalance() for Token-2022 account
Current APY — read from VaultConfig.current_apy_bps on-chain
Deposit transactions — real Solana transactions, verifiable on Explorer
Redeem transactions — real burns and SOL transfers from vault PDA
Pyth price feed — live oracle data consumed by smart contract at transaction time
Drift funding rate — live market data read by keeper bot

Frontend Projection

The ticking sUSD balance — JavaScript continuous compounding running at 100ms intervals showing projected balance. Actual on-chain balance settles at each transaction. This is standard DeFi UX (same pattern as Aave, Compound).


Tech Stack
ComponentTechnologySmart ContractRust + Anchor 0.32Token StandardToken-2022 (SPL)OraclePyth NetworkYield SourceDrift Protocol (SOL-PERP)FrontendNext.js 16 + React 19StylingTailwind CSS v4WalletSolana Wallet AdapterAnchor Client@coral-xyz/anchor 0.32Rate KeeperNode.js + @drift-labs/sdkDeploymentVercel

Build Status
ComponentStatusNotesSmart Contract 
DeployedDevnetVault Initialization 
CompleteVaultConfig PDA activeDeposit & Mint 
WorkingTested with real transactionsRedeem & Burn 
WorkingTested successfullyPyth Oracle
LiveSOL/USD feed activeKeeper Bot
Running50% APY live on-chainDrift Integration
Reading2.35%/hr funding rateFrontend UI
CompleteVercel Deployment


Getting Started
Prerequisites

Node.js 18+
Rust + Solana CLI
Anchor CLI 0.32
A Solana wallet with devnet SOL (use solana airdrop 2 on devnet)

Clone the Repository
bashgit clone https://github.com/your-username/equinox-protocol
cd equinox-protocol
Smart Contract
bashcd programs/equinox
anchor build
anchor deploy --provider.cluster devnet
Frontend
bashcd app
npm install
npm run dev
Open http://localhost:3000, connect your Phantom wallet (set to Devnet), and deposit SOL.
Keeper Bot
bashcd keeper
npm install
KEEPER_KEYPAIR=<path-to-keypair.json> node index.js

Risks & Limitations
RiskDescriptionMitigationOracle riskStale or manipulated Pyth feed could affect mint/redeem pricesPyth confidence interval checks on-chainFunding rate riskSOL-PERP rates can drop to zero or go negativeKeeper clamps minimum APY at 1%Smart contract riskUnaudited Rust codeAudit required before mainnetDevnet vault sizeLimited to ~4 SOL in devnet reservesNon-issue on mainnet with real deposits



Why This Matters
The Solana perpetuals market generates billions in funding payments annually. Nearly all of it flows to sophisticated market makers and professional trading desks. Equinox is the infrastructure layer that routes a portion of that yield back to everyday SOL holders — democratizing access to one of crypto's most consistent yield sources.

Contact
For questions, source code access, or collaboration inquiries, open an issue or reach out to the development team.

Built on Solana · Powered by Pyth + Drift · Devnet v0.1.0
