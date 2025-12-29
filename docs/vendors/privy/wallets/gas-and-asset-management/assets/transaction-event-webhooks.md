# Fetch transaction via webhook

<Warning>
  The following functionality exists for [wallets reconstituted
  server-side](/wallets/wallets/create/create-a-wallet). More on [Privy architecture
  here](/security/wallet-infrastructure/architecture)
</Warning>

**Privy emits webhooks whenever the status of a transaction sent by a wallet changes.** This helps your application track the status of the transaction after it has been broadcasted to the network, and be notified when the transaction is confirmed or reverts.

<Info>
  Webhooks is currently a scale feature. To use webhooks, please upgrade your account in the Privy
  Dashboard.
</Info>

To set up transaction webhooks, follow the guide below.

## Events

Privy allows you to subscribe to webhooks on the following transaction events:

* `'broadcasted'` refers to when a transaction has been submitted to the network but has not yet been included in a block
* `'still_pending'` refers to when a transaction has been submitted to the network but is taking longer than expected to be confirmed. To ensure that the transaction gets included, we recommend listening to this webhook to trigger [transaction speed-ups](/recipes/speeding-up-transactions).
* `'confirmed'` refers to when a transaction has been included in at least one block that has been confirmed on the network.
* `'execution_reverted'` refers to when a transaction has reverted in execution.
* `'replaced'` refers to when a transaction has been replaced by another transaction with the same nonce. This is only applicable to EVM chains.
* `'failed'` refers to when a transaction has been pending for too long, signaling that it will not be included on-chain. This can happen when the gas fee is too low given the current activity on the blockchain and is only triggered for chains that have a defined pending time limit (e.g. Base, Solana, Flow.).
* `'provider_error'` refers to when a custodial wallet transaction request has been rejected by the custodian or encountered an error. This can happen when you attempt to spend funds that haven't been fully screened by the custodian yet, or when a transaction does not meet the custodian's compliance requirements.

<Info>
  Failures are uncommon overall, but more likely to occur on Base and Polygon than other chains
  (\<1% of transactions). To ensure transactions get confirmed, follow our guide on [transaction
  replacement](/recipes/speeding-up-transactions) to speed up stalled transactions.
</Info>

## Setup

To start, go to the **Webhooks** page for your app in the [Privy Dashboard](https://dashboard.privy.io) and provide a destination URL for receiving webhooks.

Then, enable the `'transaction.broadcasted'`, `transaction.still_pending`, `'transaction.confirmed'`, `'transaction.execution_reverted'`, `'transaction.replaced'`, and/or `'transaction.failed'` events depending on the transaction events you'd like to be notified of.

Privy will emit a signed webhook to this URL whenever transaction status updates, and will retry delivery if the endpoint does not successfully respond to the original webhook.

## Payload

When the status of a transaction updates, Privy will emit a webhooks payload with the following fields:

<ResponseField name="type" type="'transaction.{broadcasted, still_pending, confirmed, execution_reverted, replaced, failed, provider_error}'">
  Event for the transaction.
</ResponseField>

<ResponseField name="transaction_id" type="string">
  ID for the transaction.
</ResponseField>

<ResponseField name="wallet_id" type="string">
  ID of the wallet that sent the transaction.
</ResponseField>

<ResponseField name="transaction_hash" type="string">
  Hash for the transaction.
</ResponseField>

<ResponseField name="caip2" type="string">
  CAIP-2 chain ID of the network that the transaction was broadcasted on.
</ResponseField>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n