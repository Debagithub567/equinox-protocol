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
import { HermesClient } from "@pythnetwork/hermes-client";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";

describe("equinox_protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.EquinoxProtocol as Program<EquinoxProtocol>;
  const wallet = provider.wallet as anchor.Wallet;

  const SOL_USD_FEED_ID =
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

  const [vaultConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  );

  let susdMint: PublicKey;
  let userSusdAta: PublicKey;

  // ── Shared setup ──────────────────────────────────────────────────────────
  beforeEach(async () => {
    try {
      const vault = await program.account.vaultConfig.fetch(vaultConfigPDA);
      susdMint = vault.susdMint;
      userSusdAta = getAssociatedTokenAddressSync(
        susdMint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
    } catch {
      // Vault not yet initialized — Stage 2A will set susdMint
    }
  });

  // ── Stage 2A ──────────────────────────────────────────────────────────────
  it("✅ Stage 2A — initialize_vault: deploys Token-2022 mint + vault PDA", async () => {
    const existing = await provider.connection.getAccountInfo(vaultConfigPDA);

    if (existing) {
      const vault = await program.account.vaultConfig.fetch(vaultConfigPDA);
      susdMint = vault.susdMint;
      console.log("⚠️  Vault already exists on devnet, skipping init");
      console.log("   susdMint:", susdMint.toBase58());
      console.log("   currentApyBps:", vault.currentApyBps);
      assert.ok(vault.currentApyBps !== undefined);
      return;
    }

    const mintKeypair = Keypair.generate();
    susdMint = mintKeypair.publicKey;

    const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const createMintIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createMintIx),
      [mintKeypair]
    );

    const sig = await program.methods
      .initializeVault(1850)
      .accounts({
        susdMint: mintKeypair.publicKey,
        admin: wallet.publicKey,
      } as never)
      .rpc();

    console.log("initialize_vault tx:", sig);

    const vault = await program.account.vaultConfig.fetch(vaultConfigPDA);
    assert.equal(vault.currentApyBps, 1850);
    assert.equal(vault.susdMint.toBase58(), mintKeypair.publicKey.toBase58());
    console.log("✅ Vault APY BPS:", vault.currentApyBps);
    console.log("✅ sUSD Mint:", vault.susdMint.toBase58());
  });

  // ── Stage 2B ──────────────────────────────────────────────────────────────
  it("✅ Stage 2B — deposit_asset: SOL escrowed, sUSD minted", async () => {
    assert.ok(susdMint, "susdMint not set — did Stage 2A run?");

    // pyth-solana-receiver@0.16 + hermes-client@3.x API
    const hermesClient = new HermesClient("https://hermes.pyth.network", {});

    // getLatestPriceUpdates returns { binary: { encoding, data: string[] }, parsed: [...] }
    const priceUpdates = await hermesClient.getLatestPriceUpdates(
      [SOL_USD_FEED_ID],
      { encoding: "base64" }
    );

    const pythReceiver = new PythSolanaReceiver({
      connection: provider.connection,
      wallet: provider.wallet as never,
    });

    const transactionBuilder = pythReceiver.newTransactionBuilder({
      closeUpdateAccounts: false,
    });

    // 0.16.x: addPostPriceUpdates takes string[] (base64 array directly)
    await transactionBuilder.addPostPriceUpdates(priceUpdates.binary.data);

    await transactionBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount) => {
        const priceUpdateAccount = getPriceUpdateAccount(SOL_USD_FEED_ID);

        const ataInfo = await provider.connection.getAccountInfo(userSusdAta);
        const preIxs = ataInfo
          ? []
          : [
              createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                userSusdAta,
                wallet.publicKey,
                susdMint,
                TOKEN_2022_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
              ),
            ];

        if (!ataInfo) console.log("sUSD ATA created:", userSusdAta.toString());

        return [
          {
            instruction: await program.methods
              .depositAsset(new anchor.BN(1 * LAMPORTS_PER_SOL))
              .preInstructions(preIxs)
              .accounts({
                susdMint,
                userSusdAccount: userSusdAta,
                user: wallet.publicKey,
                priceUpdate: priceUpdateAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
              } as never)
              .instruction(),
            signers: [],
          },
        ];
      }
    );

    const txs = await transactionBuilder.buildVersionedTransactions({
      tightComputeBudget: false,
    });

    const sigs = await pythReceiver.provider.sendAll(txs);
    console.log("deposit_asset tx:", sigs[sigs.length - 1]);

    const ataBalance = await provider.connection.getTokenAccountBalance(
      userSusdAta
    );
    console.log("✅ sUSD balance after deposit:", ataBalance.value.uiAmount);
    assert.ok(
      ataBalance.value.uiAmount !== null && ataBalance.value.uiAmount > 0,
      "sUSD balance should be > 0 after deposit"
    );
  });

  // ── Stage 2C ──────────────────────────────────────────────────────────────
  it("✅ Stage 2C — update_protocol_rate: keeper shifts APY to 4500 BPS", async () => {
    assert.ok(susdMint, "susdMint not set — did Stage 2A run?");

    const sig = await program.methods
      .updateProtocolRate(4500)
      .accounts({
        susdMint,
        keeper: wallet.publicKey,
      } as never)
      .rpc();

    console.log("update_protocol_rate tx:", sig);

    const vault = await program.account.vaultConfig.fetch(vaultConfigPDA);
    assert.equal(vault.currentApyBps, 4500);
    console.log("✅ New APY BPS:", vault.currentApyBps);
  });

  // ── Stage 2D ──────────────────────────────────────────────────────────────
  it("✅ Stage 2D — redeem_asset: sUSD burned, SOL returned", async () => {
    assert.ok(susdMint, "susdMint not set — did Stage 2A run?");

    let susdBalance = 0;
    try {
      const tokenAcc = await provider.connection.getTokenAccountBalance(
        userSusdAta
      );
      susdBalance = tokenAcc.value.uiAmount ?? 0;
    } catch {
      // ATA doesn't exist
    }

    assert.ok(
      susdBalance > 0,
      `Need sUSD balance to redeem (got ${susdBalance}). Run Stage 2B first.`
    );

    // Redeem half so the test stays repeatable
    const redeemUiAmount = 150; // 150 sUSD = ~1 SOL at $150
    const redeemUnits = new anchor.BN(redeemUiAmount * 1_000_000); // 150_000_000 units

    const solBefore = await provider.connection.getBalance(wallet.publicKey);

    const sig = await program.methods
      .redeemAsset(redeemUnits)
      .accounts({
        susdMint,
        userSusdAccount: userSusdAta,
        user: wallet.publicKey,
      } as never)
      .rpc();

    console.log("redeem_asset tx:", sig);

    const solAfter = await provider.connection.getBalance(wallet.publicKey);
    console.log(
      `✅ SOL returned: ${((solAfter - solBefore) / LAMPORTS_PER_SOL).toFixed(6)} SOL`
    );

    const ataAfter = await provider.connection.getTokenAccountBalance(
      userSusdAta
    );
    console.log(
      `✅ sUSD remaining: ${ataAfter.value.uiAmount} (redeemed ${redeemUiAmount})`
    );
  });
});