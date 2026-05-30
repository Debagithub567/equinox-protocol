import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { DriftClient, initialize, BulkAccountLoader } from "@drift-labs/sdk";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID);
const VAULT_SEED = Buffer.from("vault_config");
const SUSD_MINT = new PublicKey(process.env.SUSD_MINT);
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const IDL = {
  address: process.env.PROGRAM_ID,
  metadata: { name: "equinox_protocol", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "update_protocol_rate",
      discriminator: [197, 38, 93, 54, 26, 66, 172, 99],
      accounts: [
        { name: "vault_config", writable: true },
        { name: "susd_mint", writable: true },
        { name: "keeper", signer: true },
        { name: "token_program" },
      ],
      args: [{ name: "new_rate_bps", type: "i16" }],
    },
  ],
  accounts: [{ name: "VaultConfig", discriminator: [99, 86, 43, 216, 184, 102, 119, 77] }],
  types: [
    {
      name: "VaultConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "pubkey" },
          { name: "rate_keeper", type: "pubkey" },
          { name: "susd_mint", type: "pubkey" },
          { name: "current_apy_bps", type: "i16" },
          { name: "bump", type: "u8" },
          { name: "total_sol_deposited", type: "u64" },
        ],
      },
    },
  ],
};

async function getFundingRateBps(driftClient) {
  try {
    const solPerpMarket = driftClient.getPerpMarketAccount(0);
    if (!solPerpMarket) return 500;
    const fundingRate = solPerpMarket.amm.lastFundingRate.toNumber();
    const fundingRateHourly = fundingRate / 1e6;
    const fundingRateAnnual = fundingRateHourly * 24 * 365;
    const bps = Math.round(Math.abs(fundingRateAnnual) * 10000);
    const clamped = Math.max(100, Math.min(5000, bps));
    console.log(`[Keeper] Drift SOL-PERP funding rate: ${fundingRateHourly.toFixed(6)}/hr → ${clamped} BPS annualized`);
    return clamped;
  } catch (e) {
    console.error("[Keeper] Failed to read Drift funding rate, using fallback:", e.message);
    return 500;
  }
}

async function main() {
  const connection = new Connection(process.env.RPC_URL, "confirmed");
  const raw = JSON.parse(fs.readFileSync(process.env.KEEPER_KEYPAIR_PATH, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  const wallet = new anchor.Wallet(keypair);

  console.log(`[Keeper] Starting. Wallet: ${keypair.publicKey.toString()}`);

  const bulkAccountLoader = new BulkAccountLoader(connection, "confirmed", 1000);
  const sdkConfig = initialize({ env: "devnet" });

  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
    accountSubscription: { type: "polling", accountLoader: bulkAccountLoader },
  });

  await driftClient.subscribe();
  console.log("[Keeper] Drift client subscribed");

  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(IDL, provider);
  const [vaultConfig] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);

  async function updateRate() {
    try {
      const bps = await getFundingRateBps(driftClient);
      const sig = await program.methods
        .updateProtocolRate(bps)
        .accounts({
          vaultConfig,
          susdMint: SUSD_MINT,
          keeper: keypair.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      console.log(`[Keeper] ✅ Rate updated to ${bps} BPS | tx: ${sig}`);
    } catch (e) {
      console.error("[Keeper] ❌ Rate update failed:", e.message);
    }
  }

  await updateRate();
  setInterval(updateRate, 60_000);
}

main().catch(console.error);
