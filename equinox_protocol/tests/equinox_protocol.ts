import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EquinoxProtocol } from "../target/types/equinox_protocol";
import {
  Keypair,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";
import { assert } from "chai";

describe("equinox_protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.EquinoxProtocol as Program<EquinoxProtocol>;
  const wallet = provider.wallet as anchor.Wallet;

  // ── PDAs ──────────────────────────────────────────────────────────────────
  const [vaultConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  );
  const [solVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    program.programId
  );

  // ── Mint keypair (generated fresh each test run) ──────────────────────────
  const mintKeypair = Keypair.generate();

  // ── User's sUSD Associated Token Account ─────────────────────────────────
  const userSusdAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // ─────────────────────────────────────────────────────────────────────────
  it("✅ Stage 2A — initialize_vault: deploys Token-2022 mint + vault PDA", async () => {
    // 1. Calculate space needed for mint with InterestBearing extension
    const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);

    // 2. Fund the mint account with rent
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const createMintAccountIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    // 3. Build + send transaction: create mint account THEN initialize_vault
    const tx = new anchor.web3.Transaction().add(createMintAccountIx);

    await provider.sendAndConfirm(tx, [mintKeypair]);

    // 4. Now call initialize_vault
    const sig = await program.methods
      .initializeVault(1850) // 18.50% APY
      .accounts({
        vaultConfig: vaultConfigPDA,
        susdMint: mintKeypair.publicKey,
        admin: wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  initialize_vault tx:", sig);

    // 5. Verify vault state
    const vault = await program.account.vaultConfig.fetch(vaultConfigPDA);
    assert.equal(vault.currentApyBps, 1850, "APY BPS should be 1850");
    assert.equal(
      vault.susdMint.toBase58(),
      mintKeypair.publicKey.toBase58(),
      "Mint address should match"
    );
    console.log("  ✅ Vault APY BPS:", vault.currentApyBps);
    console.log("  ✅ sUSD Mint:", vault.susdMint.toBase58());
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("✅ Stage 2B — deposit_asset: SOL escrowed, sUSD minted", async () => {
    // 1. Create user's sUSD ATA first
    const createAtaIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      userSusdAta,
      wallet.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ataTx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(ataTx);
    console.log("  sUSD ATA created:", userSusdAta.toBase58());

    // 2. Deposit 1 SOL
    const depositAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    const sig = await program.methods
      .depositAsset(depositAmount)
      .accounts({
        vaultConfig: vaultConfigPDA,
        solVault: solVaultPDA,
        susdMint: mintKeypair.publicKey,
        userSusdAccount: userSusdAta,
        user: wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  deposit_asset tx:", sig);

    // 3. Verify sUSD landed in user's ATA
    const ataInfo = await provider.connection.getTokenAccountBalance(userSusdAta);
    console.log("  ✅ sUSD balance after deposit:", ataInfo.value.uiAmountString);
    assert.ok(
      parseInt(ataInfo.value.amount) > 0,
      "sUSD balance should be greater than 0"
    );

    // 4. Verify SOL is locked in vault
    const vaultLamports = await provider.connection.getBalance(solVaultPDA);
    console.log("  ✅ SOL locked in vault:", vaultLamports / LAMPORTS_PER_SOL, "SOL");
    assert.equal(vaultLamports, 1 * LAMPORTS_PER_SOL, "Vault should hold 1 SOL");
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("✅ Stage 2C — update_protocol_rate: keeper shifts APY to 4500 BPS", async () => {
    const sig = await program.methods
      .updateProtocolRate(4500) // 45% APY
      .accounts({
        vaultConfig: vaultConfigPDA,
        susdMint: mintKeypair.publicKey,
        keeper: wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("  update_protocol_rate tx:", sig);

    const vault = await program.account.vaultConfig.fetch(vaultConfigPDA);
    assert.equal(vault.currentApyBps, 4500, "APY BPS should now be 4500");
    console.log("  ✅ New APY BPS:", vault.currentApyBps);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("✅ Stage 2D — redeem_asset: sUSD burned, SOL returned", async () => {
    // Redeem 100 sUSD (100 * 10^6 micro units)
    const redeemAmount = new anchor.BN(100 * 1_000_000);

    const balanceBefore = await provider.connection.getBalance(wallet.publicKey);

    const sig = await program.methods
      .redeemAsset(redeemAmount)
      .accounts({
        vaultConfig: vaultConfigPDA,
        solVault: solVaultPDA,
        susdMint: mintKeypair.publicKey,
        userSusdAccount: userSusdAta,
        user: wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  redeem_asset tx:", sig);

    const balanceAfter = await provider.connection.getBalance(wallet.publicKey);
    const ataInfo = await provider.connection.getTokenAccountBalance(userSusdAta);

    console.log("  ✅ sUSD balance after redeem:", ataInfo.value.uiAmountString);
    console.log(
      "  ✅ SOL returned:",
      (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL,
      "SOL"
    );
  });
});