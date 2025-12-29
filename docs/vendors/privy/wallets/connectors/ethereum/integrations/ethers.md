# Integrating with ethers

## Ethers

Privy is fully compatible with ethers.js. To get an ethers provider for a user's connected wallet, first [find your desired wallet](/wallets/wallets/get-a-wallet/get-connected-wallet) from the **`wallets`** array and switch it to your desired network, using the wallet's **`switchChain`** method:

### Ethers v5

```tsx  theme={"system"}
const privyProvider = await wallet.getEthereumProvider();
const provider = new ethers.providers.Web3Provider(privyProvider);
```

### Ethers v6

```tsx  theme={"system"}
const provider = await wallet.getEthereumProvider();
const ethersProvider = new ethers.BrowserProvider(provider);
const signer = ethersProvider.getSigner();
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n