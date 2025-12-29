# Transaction management

Privy provides your business with powerful **transaction management** capabilities, including:

* Treasury management for businesses holding digital assets
* TEE-secured cryptographic signing infrastructure
* Facilitating payments and subscriptions
* Moving and managing assets between fiat and crypto rails
* Receiving notifications on deposits and withdrawals on the blockchain and taking actions accordingly

and more. Learn more about Privy's transaction management capabilities below.

## Control model

Privy wallets come with a highly-configurable [**control model**](/transaction-management/models/permissions) that enables you to set up your wallets based on your business's regulatory needs and custody stance. You can configure wallets to be controlled by a single party, multiple parties, or a quorum (m-of-n) of multiple parties.

In addition, [owners](/controls/authorization-keys/owners/overview) of a wallet can delegate specific permissions to other parties to take actions on the wallet's behalf. This enables your product to automate preconfigured actions on behalf of a user (like limit orders, portfolio rebalancing, etc), delegation of assets to agents, and more. The scope of these permissioned actions can be restricted via policies.

## Policies

You can attach [policies](/transaction-management/models/policies) to wallets to enhance the security of your assets and restrict the scope of transactions that can be made with a wallet. For instance, your business might enforce a policy that a given wallet can only transact with a certain asset like USDC or that it can only send assets to a specific set of allowlisted addresses.

Privy's policy engine is highly expressive and enables your application to restrict transactions based on raw transaction parameters (recipient, chain, gas fees, etc.), smart contract parameters, calldata strings, and more.

## Chain support

Privy powers wallets on any blockchain using the Ed25519 or sec256k1 signature curves. This includes:

* all EVM chains, including Ethereum, Base, Arbitrum, HyperEVM, and custom rollups
* all SVM chains, including Solana and Eclipse
* Bitcoin L2s, including Spark and Lightning
* Stellar
* Tron
* Cosmos
* Bitcoin
* Spark
* Sui
* NEAR
* TON

Learn more about [chain support](/transaction-management/chain-support).

## Gas management

Privy's powerful **gas sponsorship** engine allows you to manage transaction fees across all of your wallets through a single payment flow. Privy facilitates gas payments across all of your wallets on your behalf, and streamlines payment into a single monthly bill for your business.

You can also use Privy's **policy engine** to restrict how different wallets can use your business's shared gas balance, ensuring that funds allocated for gas payments specifically are secured to only be used in specific interactions.

## Webhooks

Privy offers **webhooks for transaction statuses, deposits, and withdrawals** as well as **REST APIs for querying transaction status, balances, and more**. In addition, you can use **idempotency keys** to ensure that certain actions are idempotent to prevent against the double-spend of funds.

This streamlines the experience of keeping your business's financial ledgering in sync with the blockchain. Your business can focus on its core value proposition; Privy manages synchronizing with the blockchain, facilitating transactions, and indexing deposits and withdrawals for you.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n