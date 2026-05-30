"use client";
import { useEffect, useState } from "react";

interface Props {
  lastSeen: number | null;
  currentBps: number;
}

export function KeeperStatus({ lastSeen, currentBps }: Props) {
  const [elapsed, setElapsed] = useState<string>("—");

  useEffect(() => {
    if (!lastSeen) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - lastSeen) / 1000);
      if (secs < 60) setElapsed(`${secs}s ago`);
      else setElapsed(`${Math.floor(secs / 60)}m ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSeen]);

  const isLive = lastSeen && Date.now() - lastSeen < 90_000;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col gap-4">
      <h2 className="text-sm text-zinc-400 tracking-widest uppercase">Keeper Status</h2>
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${isLive ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-zinc-600"}`} />
        <span className={`text-sm font-medium ${isLive ? "text-emerald-400" : "text-zinc-500"}`}>
          {isLive ? "Live" : "Offline"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Last rate update</span>
          <span className="text-zinc-300">{lastSeen ? elapsed : "never"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Source</span>
          <span className="text-zinc-300">Drift SOL-PERP funding</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Current rate</span>
          <span className="text-violet-400">{(currentBps / 100).toFixed(2)}% APY</span>
        </div>
      </div>
      {!isLive && (
        <p className="text-xs text-zinc-600 border border-zinc-800 rounded-lg px-3 py-2">
          Run <code className="text-zinc-400">node keeper/index.js</code> to start
        </p>
      )}
    </div>
  );
}