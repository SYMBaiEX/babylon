# Bankr Twitter bot guide

This guide will walk through building a Twitter bot on top of the Clanker protocol similar to **[Bankr](https://bankr.bot/)**, **[Dealr](https://dealr.fun/)**, **[Beamr](https://beamr.xyz/)**, and others. This bot will use an LLM to interpret user requests, Privy wallets to manage EVM accounts, and the Clanker protocol to deploy tokens on Base.

### Resources

<CardGroup cols={3}>
  <Card title="Clanker API docs" icon="arrow-up-right-from-square" href="https://clanker.gitbook.io/clanker-documentation/developers/api" arrow>
    Learn how to deploy tokens on Base using the Clanker API.
  </Card>

  <Card title="Privy Wallets" icon="wallet" href="/wallets/overview" arrow>
    Privy wallets for secure EVM wallet management.
  </Card>

  <Card title="Twitter API" icon="twitter" href="https://developer.twitter.com/en/docs/twitter-api" arrow>
    Reference for building bots on Twitter.
  </Card>
</CardGroup>

## Set up your Twitter bot

To interact with users, you'll need a Twitter developer account and a bot. Learn more [here](https://developer.twitter.com/en/docs/twitter-api/getting-started/getting-access-to-the-twitter-api).

<Expandable title="Set up Twitter bot (pseudocode)">
  <Steps>
    <Step title="Register your Twitter app">
      1. Go to the [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard).
      2. Create a new project and app.
      3. Generate API keys and access tokens.
      4. Safely store your credentials.
    </Step>

    <Step title="Set up Node.js Twitter bot server">
      1. Use a library like `twitter-api-v2` to interact with Twitter.
      2. Install the library:

      <CodeGroup>
        ```bash npm theme={"system"}
        npm install twitter-api-v2
        ```

        ```bash pnpm theme={"system"}
        pnpm install twitter-api-v2
        ```

        ```bash yarn theme={"system"}
        yarn add twitter-api-v2
        ```
      </CodeGroup>

      3. Create a basic Twitter client setup:

      ```typescript  theme={"system"}
      import { TwitterApi } from 'twitter-api-v2';

      // Initialize the Twitter client with your credentials
      const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_SECRET!,
      });

      // Get the read/write client
      const rwClient = client.readWrite;
      ```

      4. Example Node.js code to poll for mentions and robustly parse commands:

      <Expandable title="Example Twitter API mention payload">
        ```json  theme={"system"}
        {
          "data": {
            "id": "1234567890123456789",
            "text": "@bankr_bot send @elonmusk 1 eth from my wallet",
            "author_id": "09876543210987654321",
            "entities": {
              "mentions": [
                { "start": 0, "end": 10, "username": "bankr_bot" },
                { "start": 16, "end": 25, "username": "elonmusk" }
              ]
            }
          },
          "includes": {
            "users": [
              { "id": "09876543210987654321", "username": "sender_username", "name": "Sender Name" },
              { "id": "12345678909876543210", "username": "bankr_bot", "name": "Bankr Bot" },
              { "id": "11223344556677889900", "username": "elonmusk", "name": "Elon Musk" }
            ]
          }
        }
        ```
      </Expandable>

      ```typescript  theme={"system"}
      async function pollMentions() {
        let sinceId: string | undefined = undefined;
        while (true) {
          const mentions = await rwClient.v2.userMentionTimeline('YOUR_BOT_USER_ID', {
            since_id: sinceId,
            expansions: ['author_id', 'entities.mentions.username'],
            'user.fields': ['username', 'name'],
            max_results: 5,
          });
          for (const tweet of mentions.data?.data || []) {
            const parsed = processTweet(tweet, mentions);
            if (parsed) {
              // Call your LLM or transaction logic here
              // e.g. handleCommand(parsed)
            }
            sinceId = tweet.id;
          }
          await new Promise(res => setTimeout(res, 10000)); // poll every 10s
        }
      }

      function processTweet(tweet, mentionsResponse) {
        // Extract basic tweet information
        const text = tweet.text;
        const authorId = tweet.author_id;
        const tweetId = tweet.id;
        const mentions = tweet.entities?.mentions || [];

        // Extract all mentioned users
        const mentionedUsers = mentions.map(mention => {
          const username = mention.username;
          const user = mentionsResponse.includes?.users.find(u => u.username === username);
          return {
            username,
            userId: user?.id,
            isBot: username === 'bankr_bot' // Identify if this is our bot
          };
        });

        // Pass the structured data to the LLM for intent detection
        return {
          text,
          authorId,
          tweetId,
          mentions: mentionedUsers,
          // Additional context can be added here
        };
      }
      ```

      * This code polls for new mentions, parses the tweet for sender, recipient, amount, and currency, and passes the result to your LLM or transaction logic.
      * For production, consider using the [filtered stream](https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/streaming.md) for real-time events.
    </Step>
  </Steps>
</Expandable>

## Set up Privy wallets

Privy wallets let you create and control EVM wallets programmatically. Learn more about [getting started with wallets](/basics/nodeJS/installation).

## Using wallets

In our example application, we will build two basic interactions with Privy wallets:

* **Create a wallet**
* **Get a user's wallet**

Using these core building blocks, we can allow our bot to seamlessly and securely create and manage wallets for users.

<Steps>
  <Step title="Create a wallet for a user">
    This function creates a new wallet for a user and saves the wallet ID to the database.

    <CodeGroup>
      ```ts @privy-io/node {skip-check} theme={"system"}
      /**
       * Creates a new wallet for a user
       * @param userId - The Twitter user ID
       * @returns The wallet object with id, address, and other properties
       */
      async function createUserWallet(userId) {
        // Create a new wallet for the user
        const wallet = await privy.wallets().create({chain_type: 'ethereum'});

        // EXAMPLE: Save the wallet ID to the database to save the mapping between the user and their wallet
        await db.wallets.set(userId, wallet.id);

        return wallet;
      }
      ```

      ```ts @privy-io/server-auth {skip-check} theme={"system"}
      /**
       * Creates a new wallet for a user
       * @param userId - The Twitter user ID
       * @returns The wallet object with id, address, and other properties
       */
      async function createUserWallet(userId) {
        // Create a new wallet for the user
        const wallet = await privy.walletApi.createWallet({chainType: 'ethereum'});

        // EXAMPLE: Save the wallet ID to the database to save the mapping between the user and their wallet
        await db.wallets.set(userId, wallet.id);

        return wallet;
      }
      ```
    </CodeGroup>
  </Step>

  <Step title="Get a user wallet">
    This function checks if a user has a wallet and returns it if it exists.

    <CodeGroup>
      ```ts @privy-io/node {skip-check} theme={"system"}
      /**
       * Gets a user's wallet if it exists
       * @param userId - The Twitter user ID
       * @returns The wallet object or null if no wallet exists
       */
      async function getUserWallet(userId) {
        // EXAMPLE: Check if user already has a wallet
        const walletId = await db.wallets.get(userId);

        // If wallet exists, retrieve and return the wallet
        if (walletId) {
          const wallet = await privy.wallets().get(walletId);
          return wallet;
        }

        return null;
      }
      ```

      ```ts @privy-io/server-auth {skip-check} theme={"system"}
      /**
       * Gets a user's wallet if it exists
       * @param userId - The Twitter user ID
       * @returns The wallet object or null if no wallet exists
       */
      async function getUserWallet(userId) {
        // EXAMPLE: Check if user already has a wallet
        const walletId = await db.wallets.get(userId);

        // If wallet exists, retrieve and return the wallet
        if (walletId) {
          const wallet = await privy.walletApi.getWallet(walletId);
          return wallet;
        }

        return null;
      }
      ```
    </CodeGroup>
  </Step>

  <Step title="Get or create a wallet">
    A higher level function that uses the `getUserWallet` and `createUserWallet` functions to get or create a wallet for a user.

    ```typescript {skip-check} theme={"system"}
    /**
     * Gets a user's wallet or creates one if they don't have one
     * @param userId - The Twitter user ID
     * @returns The wallet object with id, address, and other properties
     */
    async function getOrCreateUserWallet(userId) {
      // Try to get existing wallet
      const existingWallet = await getUserWallet(userId);

      // Return existing wallet if found
      if (existingWallet) {
        return existingWallet;
      }

      // Create a new wallet if none exists
      return createUserWallet(userId);
    }

    // Example usage:
    const wallet = await getOrCreateUserWallet(parsed.authorId);
    ```
  </Step>
</Steps>

## Integrate LLM for intent detection

Use an LLM to interpret user messages and decide what action to take. Treat the LLM as a black box that receives a prompt and returns a structured intent.

<Expandable title="Pseudocode for LLM integration">
  <Steps>
    <Step title="Sample LLM prompt and response">
      **Prompt:**

      ```text  theme={"system"}
      User: Launch a token called $CAT with 1B supply
      System: Extract the intent and parameters for a token launch on Base.
      Output format: { action: string, params: object }
      ```

      **LLM Response:**

      ```json  theme={"system"}
      {
        "action": "launch_token",
        "params": {
          "name": "CAT",
          "symbol": "$CAT",
          "supply": "1000000000"
        }
      }
      ```
    </Step>

    <Step title="Pseudocode for LLM integration">
      ```typescript  theme={"system"}
      // Pseudocode: send user message to LLM and parse response
      const llmResponse = await llm.query({ prompt: userMessage });
      if (llmResponse.action === 'launch_token') {
        // Proceed to Clanker integration
      }
      ```
    </Step>
  </Steps>
</Expandable>

***

## Getting set up with Clanker API

To deploy tokens via the Clanker API, you first need to obtain an API key.

<Steps>
  <Step title="Request API access">
    1. Visit the [Clanker API
       documentation](https://clanker.gitbook.io/clanker-documentation/developers/api/deploy-a-token).
    2. Follow the instructions or contact the Clanker team via their documentation or [contact
       page](https://clanker.gitbook.io/clanker-documentation/references/contact) to request API
       access.
    3. Once approved, you'll receive an `x-api-key` to use in your API requests.
  </Step>

  <Step title="Next: Deploy a token">
    Once you have your API key, you can use it to deploy tokens via the Clanker API. See the next
    section for a full deployment code example.
  </Step>
</Steps>

***

## Example Interactions

### Deploy a token

Let users deploy tokens on Base by simply messaging the bot. The LLM interprets the intent, and the bot handles wallet lookup/creation and token deployment.

<Expandable title="Pseudocode for deploying a token">
  <Steps>
    <Step title="Sample LLM prompt and response">
      **Prompt:**

      ```text  theme={"system"}
      User: create a new $Example token
      System: Extract the intent and parameters for a token launch on Base.
      Output format: { action: string, params: object }
      ```

      **LLM Response:**

      ```json  theme={"system"}
      {
        "action": "launch_token",
        "params": {
          "name": "Example",
          "symbol": "$Example"
        }
      }
      ```
    </Step>

    <Step title="Parse Twitter message for command">
      ```typescript  theme={"system"}
      // Example incoming tweet
      const tweet = {
        text: "@YOUR_BOT_HANDLE create a new $Example token",
        author_id: "1234567890",
        id: "9876543210",
        // ...other fields
      };
      // Remove bot mention to get user command
      const userMessage = tweet.text.replace(/@YOUR_BOT_HANDLE\s*/i, "").trim();
      ```
    </Step>

    <Step title="Use LLM to extract intent and parameters">
      ```typescript  theme={"system"}
      // Send the user message to your LLM
      const llmResponse = await llm.query({ prompt: userMessage });
      // Example LLM response:
      // {
      //   action: "launch_token",
      //   params: { name: "Example", symbol: "$Example" }
      // }
      if (llmResponse.action !== 'launch_token') {
        throw new Error('Not a token launch command');
      }
      const { name, symbol } = llmResponse.params;
      ```
    </Step>

    <Step title="Look up or create user's wallet">
      ```typescript  theme={"system"}
      // Get or create a wallet for the user
      const wallet = await getOrCreateUserWallet(tweet.author_id);
      // wallet.address will be used as the requestorAddress
      ```
    </Step>

    <Step title="Deploy token using Clanker API">
      ```typescript  theme={"system"}
      import axios from 'axios';
      import crypto from 'crypto';

      const apiKey = process.env.CLANKER_API_KEY;
      const requestKey = crypto.randomBytes(16).toString('hex');
      const payload = {
        name,
        symbol,
        image: 'https://example.com/token.png', // Optional: add your image
        requestorAddress: wallet.address,
        requestKey,
        // ...other optional params
      };
      const response = await axios.post('https://www.clanker.world/api/tokens/deploy', payload, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      const tokenInfo = response.data;
      ```
    </Step>

    <Step title="Notify user of deployment">
      ```typescript  theme={"system"}
      // Send a DM or reply to the user with the token address
      await twitterClient.sendDM({
        userId: tweet.author_id,
        text: `Token deployed! Address: ${tokenInfo.address}`
      });
      ```
    </Step>
  </Steps>
</Expandable>

### Send tokens to another Twitter user with LLM

Let users send tokens (e.g., ETH on Base) to other Twitter users by simply messaging the bot. The LLM interprets the intent, and the bot handles wallet lookup/creation and transaction sending.

<Expandable title="Pseudocode for sending tokens">
  <Steps>
    <Step title="Sample LLM prompt and response">
      **Prompt:**

      ```text  theme={"system"}
      User: Hey bot, send 0.01 ETH from my wallet to @privy_io on twitter
      System: Extract the intent and parameters for a token transfer on Base.
      Output format: { action: string, params: object }
      ```

      **LLM Response:**

      ```json  theme={"system"}
      {
        "action": "send_token",
        "params": {
          "amount": "0.01",
          "token": "ETH",
          "recipient": "@privy_io"
        }
      }
      ```
    </Step>

    <Step title="Look up sender and recipient wallets">
      ```typescript  theme={"system"}
      // 1. Get sender's Twitter ID from the parsed tweet
      const senderTwitterId = parsed.authorId;

      // 2. Get recipient's Twitter handle from LLM response (e.g., '@privy_io')
      const recipientHandle = llmResponse.params.recipient.replace('@', '');

      // 3. Look up recipient's Twitter ID from parsed mentions
      const recipientMention = parsed.mentions.find(m => m.username === recipientHandle);
      if (!recipientMention || !recipientMention.userId) {
        throw new Error('Recipient not found in tweet mentions');
      }
      const recipientTwitterId = recipientMention.userId;

      // 4. Get or create recipient's wallet
      const recipientWallet = await getOrCreateUserWallet(recipientTwitterId);

      // 5. Get or create sender's wallet
      const senderWallet = await getOrCreateUserWallet(senderTwitterId);
      ```
    </Step>

    <Step title="Send transaction using Privy wallet (NodeJS)">
      <CodeGroup>
        ```ts @privy-io/node theme={"system"}
        import { parseEther } from 'viem';

        // 1. Parse the amount to wei (ETH uses 18 decimals)
        const amountEth = llmResponse.params.amount; // e.g., '1'
        const amountWei = parseEther(amountEth); // '1000000000000000000'

        // 2. Prepare transaction details
        const transaction = {
          to: recipientWallet.address,      // Recipient's EVM address
          value: amountWei,                // Amount in wei
          chainId: 8453,                   // Base chain ID
          // (Optional: add gas, data, etc.)
        };

        // 3. Send the transaction using Privy wallet
        const sendResult = await privy.wallets().ethereum().sendTransaction(senderWallet.id, {
          caip2: 'eip155:8453', // CAIP2 for Base
          params: {
            transaction,
          }
        });
        ```

        ```ts @privy-io/server-auth theme={"system"}
        import { parseEther } from 'viem';

        // 1. Parse the amount to wei (ETH uses 18 decimals)
        const amountEth = llmResponse.params.amount; // e.g., '1'
        const amountWei = parseEther(amountEth); // '1000000000000000000'

        // 2. Prepare transaction details
        const transaction = {
          to: recipientWallet.address,      // Recipient's EVM address
          value: amountWei,                // Amount in wei
          chainId: 8453,                   // Base chain ID
          // (Optional: add gas, data, etc.)
        };

        // 3. Send the transaction using Privy wallet
        const sendResult = await privy.walletApi.ethereum.sendTransaction({
          walletId: senderWallet.id,        // Sender's Privy wallet ID
          caip2: 'eip155:8453',           // CAIP2 for Base
          transaction,
        });
        ```
      </CodeGroup>
    </Step>
  </Steps>
</Expandable>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n