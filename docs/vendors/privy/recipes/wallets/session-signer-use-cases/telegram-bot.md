# Using signers to create Telegram trading bots for users

Signers allow your app to create Telegram bots or other agents that can execute transactions on behalf of users. You can use signers to execute transactions given natural language commands from users in Telegram, or execute transactions on the user's behalf while they are offline.

You can also configure signers such that your Telegram bot or agent has specific permissions via [policies](/controls/policies/overview), such that the agent can only execute certain transaction types.

At a high-level, you can use signers to create Telegram bots and other trading agents like so.

<Tip>
  Looking to build a Telegram trading bot without a web or mobile app to start? View our overall
  [Telegram trading bot guide](/recipes/telegram-bot) to learn how to set up your bot for different
  configurations.
</Tip>

<Steps>
  <Step title="Instrument your app with Privy">
    If you have not already done so, instrument your web app with Privy's [React SDK](/basics/react/quickstart) or your mobile app with Privy's [React Native SDK](/basics/react-native/quickstart) and enable [Telegram login](/authentication/user-authentication/login-methods/telegram).
  </Step>

  <Step title="Create wallets for your users">
    When your users login to your app with Telegram or link a Telegram account, [create a wallet](/wallets/wallets/create/create-a-wallet) for them. Store a mapping between the ID of the created wallet and the user's Telegram ID so that you can determine the user's wallet within the bot's code.
  </Step>

  <Step title="Add a signer to the user's wallet">
    After the wallet has been created, add a signer to the user's wallet, which the bot can use to transact on the user's behalf.

    Make sure to store the private key(s) associated with your signer ID securely in your server. Your Telegram bot or agent will need this to execute transaction requests.

    Follow the linked quickstart below to learn how to add a signer to the user's wallet.

    <CardGroup cols={1}>
      <Card title="Signer quickstart" href="/wallets/using-wallets/signers/quickstart">
        Request access to user wallets with signers.
      </Card>
    </CardGroup>
  </Step>

  <Step title="Execute actions with your signer">
    Finally, the bot can use the signer to execute transactions on the user's behalf when prompted. For instance, you might implement a `/transact` command that takes input on the user to transact on their behalf.

    <Tip>
      Make sure to [configure your Privy client](/controls/authorization-keys/using-owners/sign) with the private key for the signer (authorization key) you created in the Dashboard.
    </Tip>

    <CodeGroup>
      ```ts @privy-io/node theme={"system"}
      import {isEmbeddedWalletLinkedAccount} from '@privy-io/node';

      bot.onText(/\/transact/, async (msg) => {
          // Custom logic to infer the transaction to send from the user's message
          const transaction = getTransactionDetailsFromMsg(msg);

          // Determine user's wallet ID from their Telegram user ID
          const user = await privy.users().getByTelegramUserID({
            telegram_user_id: msg.from.id
          });
          const wallet = user.linked_accounts.find(isEmbeddedWalletLinkedAccount);
          const walletId = wallet?.id;

          if (!walletId) throw new Error('Cannot determine wallet ID for user');

          // Send transaction
          await privy.wallets().ethereum().sendTransaction(walletId, {
            caip2: 'eip155:1',
            params: {transaction}
          });
      });
      ```

      ```ts @privy-io/server-auth theme={"system"}
      bot.onText(/\/transact/, async (msg) => {
          // Custom logic to infer the transaction to send from the user's message
          const transaction = getTransactionDetailsFromMsg(msg);

          // Determine user's wallet ID from their Telegram user ID
          const user = await privy.getUserByTelegramUserId(msg.from.id);
          const wallet = user?.linkedAccounts.find((account): account is WalletWithMetadata => (account.type === 'wallet' && account.walletClientType === 'privy'));
          const walletId = wallet?.id;

          if (!walletId) throw new Error('Cannot determine wallet ID for user');

          // Send transaction
          await privy.walletApi.solana.sendTransaction({walletId, ...transaction});
      });
      ```
    </CodeGroup>

    <CardGroup cols={3}>
      <Card title="Sign requests" href="/controls/authorization-keys/using-owners/sign">
        Authorize requests to the Privy API with your signer.
      </Card>

      <Card title="EVM" href="/wallets/using-wallets/ethereum/send-a-transaction">
        Take actions on EVM chains with Privy's NodeJS SDK or REST API.
      </Card>

      <Card title="Solana" href="/wallets/using-wallets/solana/send-a-transaction">
        Take actions on Solana with Privy's NodeJS SDK or REST API.
      </Card>
    </CardGroup>
  </Step>
</Steps>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n