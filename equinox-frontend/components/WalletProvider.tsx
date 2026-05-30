"use client";
import { FC, ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export const SolanaWalletProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <ConnectionProvider endpoint="https://api.devnet.solana.com">
    <WalletProvider wallets={[]} autoConnect={false}>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
);
