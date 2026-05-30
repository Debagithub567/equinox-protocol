"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getProgram, VAULT_SEED, SOL_VAULT_SEED, PROGRAM_ID } from "@/lib/program";

interface Props {
  susdMint: PublicKey | null;
  susdBalance: number;
  onRedeemed: (sig: string, susdBurned: number) => void;
}

export function RedeemPanel({ susdMint, susdBalance, onRedeemed }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redeem = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !susdMint) return;
    setLoading(true);
    setStatus("Building transaction...");
    try {
      const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
      const program = getProgram(provider);

      const [vaultConfig] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);
      const [solVault] = PublicKey.findProgramAddressSync([SOL_VAULT_SEED], PROGRAM_ID);
      const userAta = getAssociatedTokenAddressSync(susdMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

      const susdUnits = Math.floor(parseFloat(amount) * 1_000_000);
      setStatus("Waiting for signature...");

      const sig = await (program.methods as never as {
        redeemAsset: (a: BN) => {
          accounts: (a: object) => { rpc: () => Promise<string> };
        };
      })
        .redeemAsset(new BN(susdUnits))
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

      setStatus(`✅ Redeemed ${amount} sUSD`);
      onRedeemed(sig, parseFloat(amount));
      setAmount("");
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col gap-4">
      <h2 className="text-sm text-zinc-400 tracking-widest uppercase">Redeem sUSD</h2>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="flex-1 bg-zinc-800 rounded-lg px-4 py-3 text-white text-lg outline-none focus:ring-1 focus:ring-rose-500"
        />
        <button
          onClick={() => setAmount(susdBalance.toFixed(4))}
          className="px-3 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors"
        >
          MAX
        </button>
      </div>
      <button
        onClick={redeem}
        disabled={loading || !amount || !wallet.connected}
        className="w-full py-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-colors"
      >
        {loading ? "Processing..." : "Burn sUSD → Receive SOL"}
      </button>
      {status && <p className="text-xs text-zinc-500 text-center">{status}</p>}
    </div>
  );
}