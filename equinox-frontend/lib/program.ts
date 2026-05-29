import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";

export const PROGRAM_ID = new PublicKey("CDN8JEfQibSy7RTzJacy8eXHrVTpGFTXmCqGAiZqASZ5");
export const VAULT_SEED = Buffer.from("vault_config");
export const SOL_VAULT_SEED = Buffer.from("sol_vault");

export const IDL: Idl = {
  address: "CDN8JEfQibSy7RTzJacy8eXHrVTpGFTXmCqGAiZqASZ5",
  metadata: { name: "equinoxProtocol", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initializeVault",
      discriminator: [48, 191, 163, 44, 71, 129, 63, 164],
      accounts: [
        { name: "vaultConfig", writable: true, pda: { seeds: [{ kind: "const", value: [118,97,117,108,116,95,99,111,110,102,105,103] }] } },
        { name: "susdMint", writable: true },
        { name: "admin", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
      ],
      args: [{ name: "initialRateBps", type: "i16" }],
    },
    {
      name: "depositAsset",
      discriminator: [107, 93, 89, 87, 226, 203, 154, 19],
      accounts: [
        { name: "vaultConfig", writable: true, pda: { seeds: [{ kind: "const", value: [118,97,117,108,116,95,99,111,110,102,105,103] }] } },
        { name: "solVault", writable: true, pda: { seeds: [{ kind: "const", value: [115,111,108,95,118,97,117,108,116] }] } },
        { name: "susdMint", writable: true },
        { name: "userSusdAccount", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
      ],
      args: [{ name: "amountLamports", type: "u64" }],
    },
    {
      name: "redeemAsset",
      discriminator: [184, 12, 86, 49, 212, 26, 141, 45],
      accounts: [
        { name: "vaultConfig", writable: true, pda: { seeds: [{ kind: "const", value: [118,97,117,108,116,95,99,111,110,102,105,103] }] } },
        { name: "solVault", writable: true, pda: { seeds: [{ kind: "const", value: [115,111,108,95,118,97,117,108,116] }] } },
        { name: "susdMint", writable: true },
        { name: "userSusdAccount", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
      ],
      args: [{ name: "susdAmount", type: "u64" }],
    },
    {
      name: "updateProtocolRate",
      discriminator: [220, 40, 204, 37, 193, 193, 230, 57],
      accounts: [
        { name: "vaultConfig", writable: true, pda: { seeds: [{ kind: "const", value: [118,97,117,108,116,95,99,111,110,102,105,103] }] } },
        { name: "susdMint", writable: true },
        { name: "keeper", signer: true },
        { name: "tokenProgram" },
      ],
      args: [{ name: "newRateBps", type: "i16" }],
    },
  ],
  accounts: [
    {
      name: "VaultConfig",
      discriminator: [134, 72, 43, 181, 4, 121, 24, 182],
    },
  ],
  types: [
    {
      name: "VaultConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "pubkey" },
          { name: "rateKeeper", type: "pubkey" },
          { name: "susdMint", type: "pubkey" },
          { name: "currentApyBps", type: "i16" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
} as unknown as Idl;

export function getProgram(provider: AnchorProvider) {
  return new Program(IDL, provider);
}

export function getConnection() {
  return new Connection("http://127.0.0.1:8899", "confirmed");
}