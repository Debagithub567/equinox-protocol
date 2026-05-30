"use client";
import dynamic from "next/dynamic";

export const WalletButton = dynamic(
  async () => {
    const { WalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    return WalletMultiButton;
  },
  { ssr: false }
);
