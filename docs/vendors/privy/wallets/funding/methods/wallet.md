# Funding via wallet

The **transfer from wallets** funding option enables users to transfer or bridge funds from an external wallet (e.g. MetaMask, Phantom) to their embedded wallet within your app.

If a user chooses to fund via external wallet, Privy will prompt the user to connect their external wallet to your app and will query their balance on the [chain](/wallets/funding/configuration) you've configured in the Dashboard.

<Info>
  With external wallets, users can fund their accounts on EVM networks with the network's native
  asset (e.g. ETH, POL), USDC, or ERC20 tokens, and accounts on Solana with SOL.
</Info>

<Expandable title="how to enable funding with Solana Wallets">
  To enable funding from Solana wallets, ensure your `PrivyProvider` is configured with:

  ```tsx  theme={"system"}
  <PrivyProvider
    appId="your-app-id"
    config={{
      appearance: {
        walletChainType: "ethereum-and-solana"
      },
      externalWallets: {
        solana: {
          connectors: toSolanaWalletConnectors()
        }
      },
      solana: {
        rpcs: {
          'solana:mainnet': {
            rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
            rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com')
          },
        }
      }
    }}
    ...
  >
    {/* your app */}
  </PrivyProvider>
  ```
</Expandable>

#### Transferring funds on the configured chain

If the external wallet has sufficient funds on the configured chain, Privy will prompt the user to directly **transfer** funds on the configured chain.

If users don't want to connect an external wallet, Privy will also give the users to copy their embedded wallet address or scan it with a QR code, and manually transfer funds from their external wallet to their embedded wallet.

#### Bridging funds to the configured chain

If the external wallet does not have sufficient funds on the configured chain, but has funds on other networks, Privy will prompt the user to instead **bridge** funds to your configured chain. Privy will query balances on the networks listed [here](/basics/react/advanced/configuring-evm-networks#default-configuration) and any additional [`supportedChains`](/basics/react/advanced/configuring-evm-networks#supported-chains) you configure to determine possible source chains for bridging.

If the user only has enough funds on one chain, Privy will automatically prompt the user to bridge from that chain. If the user has enough funds on multiple source chains, Privy will allow the user to select from where to bridge funds.

Users can also bridge funds from Solana to EVM networks and vice versa.

Privy uses [Reservoir Relay](https://relay.link/) to power instant bridging, and supports bridging funds to the networks listed [here](https://docs.relay.link/references/api/api_resources/supported-chains#supported-chains).


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n