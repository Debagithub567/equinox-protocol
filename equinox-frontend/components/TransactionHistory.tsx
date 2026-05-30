"use client";
import { TxRecord } from "@/app/page";

interface Props {
  txs: TxRecord[];
}

const typeLabel: Record<TxRecord["type"], { label: string; color: string }> = {
  deposit: { label: "Deposit", color: "text-emerald-400" },
  redeem: { label: "Redeem", color: "text-rose-400" },
  rate_update: { label: "Rate Update", color: "text-violet-400" },
};

export function TransactionHistory({ txs }: Props) {
  if (txs.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col gap-3">
      <h2 className="text-sm text-zinc-400 tracking-widest uppercase">Transaction History</h2>
      <div className="flex flex-col gap-2">
        {txs.map((tx) => {
          const { label, color } = typeLabel[tx.type];
          const time = new Date(tx.ts).toLocaleTimeString();
          return (
            <div key={tx.sig} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-800/50 last:border-0">
              <div className="flex items-center gap-3">
                <span className={`font-medium ${color}`}>{label}</span>
                <span className="text-zinc-400">{tx.amount}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-600">{time}</span>
                
                <a href={`https://solscan.io/tx/${tx.sig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}