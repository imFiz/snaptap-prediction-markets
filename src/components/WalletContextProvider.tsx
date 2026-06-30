import React, { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const network = 'devnet';

    // HTTP RPC goes through our backend proxy (/api/rpc -> devnet): avoids the
    // public devnet endpoint's per-IP rate limits and guarantees every
    // transaction the app submits lands on DEVNET. WS subscriptions go direct
    // to the devnet websocket (read-only, optional).
    const endpoint = useMemo(() => {
        if (typeof window !== 'undefined') return `${window.location.origin}/api/rpc`;
        return clusterApiUrl(network);
    }, [network]);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [network]
    );

    return (
        <ConnectionProvider
            endpoint={endpoint}
            config={{ commitment: 'confirmed', wsEndpoint: 'wss://api.devnet.solana.com/' }}
        >
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
