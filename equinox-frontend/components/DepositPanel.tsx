"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { getProgram, VAULT_SEED, SOL_VAULT_SEED, PROGRAM_ID } from "@/lib/program";

interface Props {
  susdMint: PublicKey | null;
  onDeposited: (susdAmount: number, ts: number) => void;
}

export function DepositPanel({ susdMint, onDeposited }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [sol, setSol] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const deposit = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !susdMint) return;
    setLoading(true);
    setStatus("Building transaction...");
    try {
      const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
      const program = getProgram(provider);

      const [vaultConfig] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);
      const [solVault] = PublicKey.findProgramAddressSync([SOL_VAULT_SEED], PROGRAM_ID);
      const userAta = getAssociatedTokenAddressSync(susdMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

      const ataInfo = await connection.getAccountInfo(userAta);
      const preIxs = ataInfo ? [] : [
        createAssociatedTokenAccountInstruction(
          wallet.publicKey, userAta, wallet.publicKey, susdMint, TOKEN_2022_PROGRAM_ID
        )
      ];

      const lamports = Math.floor(parseFloat(sol) * LAMPORTS_PER_SOL);
      setStatus("Waiting for signature...");

      await (program.methods as never as { depositAsset: (a: BN) => { preInstructions: (i: never[]) => { accounts: (a: object) => { rpc: () => Promise<string> } } } })
        .depositAsset(new BN(lamports))
        .preInstructions(preIxs as never[])
        .accounts({
          vaultConfig,
          solVault,
          susdMint,
          userSusdAccount: userAta,
          user: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const solPrice = 150;
      const susd = parseFloat(sol) * solPrice;
      setStatus(`✅ Minted ~${susd.toFixed(2)} sUSD`);
      onDeposited(susd, Date.now());
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col gap-4">
      <h2 className="text-sm text-zinc-400 tracking-widest uppercase">Deposit SOL</h2>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="0.00"
          value={sol}
          onChange={e => setSol(e.target.value)}
          className="flex-1 bg-zinc-800 rounded-lg px-4 py-3 text-white text-lg outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="flex items-center px-3 text-zinc-400 text-sm">SOL</span>
      </div>
      <button
        onClick={deposit}
        disabled={loading || !sol || !wallet.connected}
        className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold transition-colors"
      >
        {loading ? "Processing..." : "Deposit & Mint sUSD"}
      </button>
      {status && (
        <p className="text-xs text-zinc-500 text-center">{status}</p>
      )}
    </div>
  );
}