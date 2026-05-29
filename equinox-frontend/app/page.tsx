"use client";
import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { YieldTicker } from "@/components/YieldTicker";
import { DepositPanel } from "@/components/DepositPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { getProgram, VAULT_SEED, PROGRAM_ID } from "@/lib/program";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [susdMint, setSusdMint] = useState<PublicKey | null>(null);
  const [apyBps, setApyBps] = useState(500);
  const [principal, setPrincipal] = useState(0);
  const [depositedAt, setDepositedAt] = useState(Date.now());

  // Fetch vault state on connect
  useEffect(() => {
    if (!wallet.publicKey) return;
    (async () => {
      try {
        const provider = new AnchorProvider(connection, wallet as never, {});
        const program = getProgram(provider);
        const [vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);
        const vault = await (program.account as never as { vaultConfig: { fetch: (k: PublicKey) => Promise<{ susdMint: PublicKey; currentApyBps: number }> } }).vaultConfig.fetch(vaultPda);
        setSusdMint(vault.susdMint);
        setApyBps(vault.currentApyBps);
      } catch {
        // vault not initialized yet
      }
    })();
  }, [wallet.publicKey, connection]);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16 gap-12">
      {/* Header */}
      <div className="w-full max-w-xl flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-emerald-400">⬡</span> Equinox Protocol
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">Delta-neutral yield · sUSD</p>
        </div>
        <WalletMultiButton style={{
          background: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "8px",
          fontSize: "13px",
          height: "38px",
        }} />
      </div>

      {/* Live ticker */}
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur p-10 flex flex-col items-center gap-6">
        <YieldTicker principal={principal} apyBps={apyBps} depositedAt={depositedAt} />
        {!wallet.connected && (
          <p className="text-xs text-zinc-600">Connect wallet to deposit</p>
        )}
      </div>

      {/* Panels */}
      {wallet.connected && (
        <div className="w-full max-w-xl flex flex-col gap-4">
          <DepositPanel
            susdMint={susdMint}
            onDeposited={(susd, ts) => { setPrincipal(susd); setDepositedAt(ts); }}
          />
          <AdminPanel
            susdMint={susdMint}
            onRateUpdated={setApyBps}
          />
        </div>
      )}

      <p className="text-xs text-zinc-700">
        localnet · {PROGRAM_ID.toString().slice(0, 8)}...
      </p>
    </main>
  );
}