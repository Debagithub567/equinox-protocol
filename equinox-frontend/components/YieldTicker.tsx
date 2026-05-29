"use client";
import { useEffect, useState } from "react";

interface Props {
  principal: number;   // sUSD balance at deposit time
  apyBps: number;      // current rate from chain
  depositedAt: number; // unix timestamp ms
}

export function YieldTicker({ principal, apyBps, depositedAt }: Props) {
  const [display, setDisplay] = useState(principal.toFixed(6));

  useEffect(() => {
    if (principal === 0) { setDisplay("0.000000"); return; }
    const r = apyBps / 10000;
    const tick = () => {
      const t = (Date.now() - depositedAt) / (1000 * 60 * 60 * 24 * 365);
      const current = principal * Math.exp(r * t);
      setDisplay(current.toFixed(6));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [principal, apyBps, depositedAt]);

  const [whole, frac] = display.split(".");

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-zinc-500 tracking-widest uppercase">sUSD Balance</span>
      <div className="flex items-baseline gap-0.5">
        <span className="text-5xl font-bold text-emerald-400 tabular-nums">{whole}</span>
        <span className="text-2xl text-emerald-600 tabular-nums">.{frac}</span>
      </div>
      <span className="text-xs text-zinc-600">
        APY {(apyBps / 100).toFixed(2)}% · continuous compounding
      </span>
    </div>
  );
}