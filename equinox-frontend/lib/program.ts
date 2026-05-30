import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "./idl.json";

export const PROGRAM_ID = new PublicKey("CDN8JEfQibSy7RTzJacy8eXHrVTpGFTXmCqGAiZqASZ5");
export const VAULT_SEED = Buffer.from("vault_config");
export const SOL_VAULT_SEED = Buffer.from("sol_vault");

export const PYTH_SOL_USD_FEED = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
);

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as never, provider);
}

export function getConnection() {
  return new Connection("https://api.devnet.solana.com", "confirmed");
}
