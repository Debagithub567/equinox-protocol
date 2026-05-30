"use client";
import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/WalletButton";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { YieldTicker } from "@/components/YieldTicker";
import { DepositPanel } from "@/components/DepositPanel";
import { RedeemPanel } from "@/components/RedeemPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { KeeperStatus } from "@/components/KeeperStatus";
import { TransactionHistory } from "@/components/TransactionHistory";
import { getProgram, VAULT_SEED, PROGRAM_ID } from "@/lib/program";

export interface TxRecord {
  sig: string;
  type: "deposit" | "redeem" | "rate_update";
  amount: string;
  ts: number;
}

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [susdMint, setSusdMint] = useState<PublicKey | null>(null);
  const [apyBps, setApyBps] = useState(0);
  const [principal, setPrincipal] = useState(0);
  const [depositedAt, setDepositedAt] = useState(Date.now());
  const [susdBalance, setSusdBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [keeperLastSeen, setKeeperLastSeen] = useState<number | null>(null);

  const fetchVaultState = useCallback(async () => {
    if (!wallet.publicKey) return;
    try {
      const provider = new AnchorProvider(connection, wallet as never, {});
      const program = getProgram(provider);
      const [vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);
      const vault = await (program.account as never as {
        vaultConfig: {
          fetch: (k: PublicKey) => Promise<{
            susdMint: PublicKey;
            currentApyBps: number;
          }>;
        };
      }).vaultConfig.fetch(vaultPda);

      setSusdMint(vault.susdMint);
      setApyBps(vault.currentApyBps);

      // Fetch sUSD token balance
      const { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
      const userAta = getAssociatedTokenAddressSync(
        vault.susdMint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      try {
        const tokenAcc = await connection.getTokenAccountBalance(userAta);
        const bal = tokenAcc.value.uiAmount ?? 0;
        setSusdBalance(bal);
        if (bal > 0) {
          setPrincipal(bal);
          setDepositedAt(Date.now());
        }
      } catch {
        setSusdBalance(0);
      }

      // Fetch SOL balance
      const lamports = await connection.getBalance(wallet.publicKey);
      setSolBalance(lamports / 1e9);
    } catch {
      // vault not initialized yet
    }
  }, [wallet.publicKey, connection, principal]);

  useEffect(() => {
    fetchVaultState();
    const id = setInterval(fetchVaultState, 15000);
    return () => clearInterval(id);
  }, [fetchVaultState]);

  const addTx = (tx: TxRecord) => {
    setTxHistory(prev => [tx, ...prev].slice(0, 10));
    // Any update from keeper resets keeperLastSeen
    if (tx.type === "rate_update") setKeeperLastSeen(Date.now());
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16 gap-8">
      {/* Header */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-emerald-400">⬡</span> Equinox Protocol
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">
            Delta-neutral yield · sUSD · Powered by Pyth + Drift
          </p>
        </div>
        <WalletButton style={{
          background: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "8px",
          fontSize: "13px",
          height: "38px",
        }} />
      </div>

      {/* Balances row */}
      {wallet.connected && (
        <div className="w-full max-w-2xl grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-1">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">SOL Balance</span>
            <span className="text-xl font-bold text-white tabular-nums">{solBalance.toFixed(4)}</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-1">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">sUSD Balance</span>
            <span className="text-xl font-bold text-emerald-400 tabular-nums">{susdBalance.toFixed(4)}</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-1">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Current APY</span>
            <span className="text-xl font-bold text-violet-400 tabular-nums">
              {(apyBps / 100).toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Live ticker */}
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur p-10 flex flex-col items-center gap-6">
        <YieldTicker principal={principal} apyBps={apyBps} depositedAt={depositedAt} />
        {!wallet.connected && (
          <p className="text-xs text-zinc-600">Connect wallet to deposit</p>
        )}
      </div>

      {/* Panels */}
      {wallet.connected && (
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <DepositPanel
              susdMint={susdMint}
              onDeposited={(susd, ts, sig) => {
                setPrincipal(susd);
                setDepositedAt(ts);
                setSusdBalance(susd);
                addTx({ sig, type: "deposit", amount: `${susd.toFixed(2)} sUSD`, ts });
                fetchVaultState();
              }}
            />
            <RedeemPanel
              susdMint={susdMint}
              susdBalance={susdBalance}
              onRedeemed={(sig: string, susdBurned: number) => {
                addTx({ sig, type: "redeem", amount: `${susdBurned.toFixed(2)} sUSD`, ts: Date.now() });
                fetchVaultState();
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <AdminPanel
              susdMint={susdMint}
              onRateUpdated={(bps, sig) => {
                setApyBps(bps);
                addTx({ sig, type: "rate_update", amount: `${(bps / 100).toFixed(2)}% APY`, ts: Date.now() });
              }}
            />
            <KeeperStatus lastSeen={keeperLastSeen} currentBps={apyBps} />
          </div>

          <TransactionHistory txs={txHistory} />
        </div>
      )}

      <p className="text-xs text-zinc-700">
        devnet · {PROGRAM_ID.toString().slice(0, 8)}...
      </p>
    </main>
  );
}