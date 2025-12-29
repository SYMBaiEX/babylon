# Integrating with @solana/web3.js

<Tabs>
  <Tab title="React">
    Privy's **`ConnectedStandardSolanaWallet`** object is fully compatible with popular web3 libraries for interfacing wallets, such as [`@solana/web3js`](https://solana-foundation.github.io/solana-web3.js/).

    Read below to learn how to best integrate Privy alongside @solana/web3.js.

    First find your desired wallet from the **`wallets`** array:

    ```tsx  theme={"system"}
    import {PublicKey, Transaction, Connection, SystemProgram} from '@solana/web3.js';

    const {wallets} = useWallets();
    const wallet = wallets[0]; // Replace this with your desired wallet
    ```

    Then, use this wallet to then send Transactions using the @solana/web3.js Transaction and Connection classes:

    ```tsx  theme={"system"}
    // Build out the transaction object for your desired program
    // https://solana-foundation.github.io/solana-web3.js/classes/Transaction.html
    let transaction = new Transaction();

    // Send transaction
    console.log(
      await wallet.signAndSendTransaction!({
        chain: 'solana:devnet',
        transaction: new Uint8Array(
          transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
          })
        )
      })
    );
    ```
  </Tab>
</Tabs>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n