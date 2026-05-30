"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getProgram, VAULT_SEED, PROGRAM_ID } from "@/lib/program";

interface Props {
  susdMint: PublicKey | null;
  onRateUpdated: (bps: number, sig: string) => void;
}

export function AdminPanel({ susdMint, onRateUpdated }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [bps, setBps] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateRate = async () => {
    if (!wallet.publicKey || !susdMint) return;

    setLoading(true);
    setStatus("Sending...");

    try {
      const provider = new AnchorProvider(
        connection,
        wallet as never,
        { commitment: "confirmed" }
      );

      const program = getProgram(provider);

      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [VAULT_SEED],
        PROGRAM_ID
      );

      const sig = await (
        program.methods as never as {
          updateProtocolRate: (
            a: number
          ) => {
            accounts: (
              a: object
            ) => {
              rpc: () => Promise<string>;
            };
          };
        }
      )
        .updateProtocolRate(parseInt(bps))
        .accounts({
          vaultConfig,
          susdMint,
          keeper: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus(
        `✅ Rate set to ${(parseInt(bps) / 100).toFixed(2)}% APY`
      );

      onRateUpdated(parseInt(bps), sig);

    } catch (e: unknown) {
      setStatus(
        `❌ ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col gap-4">
      <h2 className="text-sm text-zinc-400 tracking-widest uppercase">
        Rate Keeper
      </h2>

      <div className="flex gap-2">
        <input
          type="number"
          placeholder="500"
          value={bps}
          onChange={(e) => setBps(e.target.value)}
          className="flex-1 bg-zinc-800 rounded-lg px-4 py-3 text-white text-lg outline-none focus:ring-1 focus:ring-violet-500"
        />
        <span className="flex items-center px-3 text-zinc-400 text-sm">
          BPS
        </span>
      </div>

      <p className="text-xs text-zinc-600">
        {bps
          ? `= ${(parseInt(bps) / 100).toFixed(2)}% APY`
          : "e.g. 500 = 5% APY"}
      </p>

      <button
        onClick={updateRate}
        disabled={loading || !bps || !wallet.connected}
        className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-colors"
      >
        {loading ? "Updating..." : "Update Protocol Rate"}
      </button>

      {status && (
        <p className="text-xs text-zinc-500 text-center">
          {status}
        </p>
      )}
    </div>
  );
}