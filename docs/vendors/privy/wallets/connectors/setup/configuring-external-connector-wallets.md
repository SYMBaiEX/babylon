# Configure wallet options

To customize the external wallet options for your app, pass in a **`WalletListEntry`** array to the **`config.appearance.walletList`** property. When users login with, connect, or link an external wallet in your app, the possible options (e.g. MetaMask, Rainbow, WalletConnect) will be presented to users in the order you configure them in this array.

```tsx  theme={"system"}
<PrivyProvider
  appId="your-privy-app-id"
  config={{
    appearance: {
      // Defaults ['detected_wallets', 'metamask', 'coinbase_wallet', 'rainbow', 'wallet_connect']
      walletList: ['metamask', 'rainbow', 'wallet_connect'],
      ...insertTheRestOfYourAppearanceConfig
    },
    ...insertTheRestOfYourPrivyProviderConfig
  }}
>
  {children}
</PrivyProvider>
```

<Info>
  When your React web app is accessed through the in-app browser of a mobile wallet (e.g., Rainbow,
  Phantom, etc.) and that wallet is selected as a login option, the Privy SDK will automatically
  detect the wallet object and prompt the user to connect in app. However, if your app is accessed
  via a standard browser (e.g., Chrome, Safari, etc.), Privy will default to using WalletConnect for
  mobile wallet connection.
</Info>

You can also configure which wallet options to show at runtime, by passing in `walletList` to the `connectWallet` method:

```tsx  theme={"system"}
import {usePrivy} from '@privy-io/react-auth';

const {connectWallet} = usePrivy();

<button onClick={() => connectWallet({walletList: ['rainbow', 'coinbase_wallet']})}>
  Login with email and sms only
</button>;
```

The possible wallets to include in the array are:

* `detected_ethereum_wallets`
* `detected_solana_wallets`
* `metamask`
* `coinbase_wallet`
* `rainbow`
* `phantom`
* `zerion`
* `cryptocom`
* `uniswap`
* `okx_wallet`
* `universal_profile`
* `bybit_wallet`
* `ronin_wallet`
* `haha_wallet`
* `safe`
* `solflare`
* `backpack`
* `binance`
* `bitget_wallet` (bitkeep)
* `kraken_wallet`
* `jupiter`
* `wallet_connect` (include this to capture the long-tail of wallets that support WalletConnect in your app)
* `wallet_connect_qr` (include this to just show a QR code to connect any wallet via the WalletConnect protocol)

The `detected_*_wallets` option includes all wallets that Privy detects which are not explicitly included elsewhere in the walletList array. As an example, if your user has the Zerion browser extension installed, it will appear under `detected_*_wallets` – unless you include `zerion` elsewhere in the `walletList` array, in which case it will appear in the placement of `zerion`.

<Info>
  Privy detects wallets via [EIP6963 injection](https://eips.ethereum.org/EIPS/eip-6963),
  `window.ethereum` injection, or a mobile wallet's in-app browser.
</Info>

<Accordion title="Using the Base Account (formerly Coinbase Smart Wallet)">
  Coinbase Smart Wallet is now [Base Account](https://www.base.org/build/base-account). If you support Coinbase Smart Wallet, you should add the `base_account` option to your walletList while keeping `coinbase_wallet` in the if you'd like to maintain support for existing Coinbase Smart Wallet users.

  For more details, see the [Base Account migration guide](https://docs.base.org/base-account/guides/migration-guide).
</Accordion>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n