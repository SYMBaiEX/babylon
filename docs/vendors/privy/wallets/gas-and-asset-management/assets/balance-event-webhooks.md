# Fetch balance via webhook

**Privy emits webhooks whenever a wallet sends or receives a registered asset.** This helps your application stay in sync with the assets in your wallets, and easily track deposits and withdrawals.

To set up deposit and/or withdrawal webhooks, follow the guide below.

<Info>
  Webhooks is currently a scale feature. To use webhooks, please upgrade your account in the Privy
  Dashboard.
</Info>

<Tip>
  Deposit webhooks are available for select chains on Tier 3 and Tier 2. To see which exact chains
  are supported, go to the [Dashboard Webhooks page.](https://dashboard.privy.io/apps?page=webhooks)
</Tip>

## Setup a webhooks URL

To start, go to the [**Webhooks**](https://dashboard.privy.io/apps?page=webhooks) page for your app in the [Privy Dashboard](https://dashboard.privy.io) and provide a destination URL for receiving webhooks.

Then, enable the `'wallet.funds_deposited'` and/or `'wallet.funds_withdrawn'` events. You can next configure which assets Privy should emit `'wallet.funds_deposited'` and/or `'wallet.funds_withdrawn'` events for.

Privy will emit a signed webhook to this URL whenever your wallets sends/receives a transaction for a registered asset, and will retry delivery if the endpoint does not successfully respond to the original webhook.
Privy's webhook system operates on a `at least once` delivery basis, and redundant requests can be identified via the `idempotency_key` field.

## Configure assets to track

Once you've enabled the `'wallet.funds_deposited'` and/or `'wallet.funds_withdrawn'` events, you can then configure which assets you'd like to track via the Privy Dashboard.

Privy supports webhooks for **native tokens** (e.g. ETH, SOL) on EVM and Solana, **ERC20 tokens** on EVM, and **SPL tokens** on Solana.

#### Native tokens

To configure webhooks for native token transactions, simply select the **Native token** asset type and provide the CAIP-2 chain ID for the network on which to track the native token.

#### ERC20 tokens

To configure webhooks for ERC20 token transfers, simply select the **ERC20 token** asset type and provide:

* the contract address for the ERC20 token
* the CAIP-2 chain ID for the network on which to track the ERC20 token

#### SPL tokens

To configure webhooks for SPL token transfers, simply select the **SPL token** asset type and provide:

* the mint address for the SPL token
* the CAIP-2 chain ID for the network on which to track the SPL token

## Payload

When a wallet receives a transaction for a registered asset, Privy will emit a webhooks payload with the following fields:

<Expandable title="child attributes" defaultOpen="true">
  <ResponseField name="type" type="'wallet.funds_deposited' | 'wallet.funds_withdrawn'">
    Event name for the webhook.
  </ResponseField>

  <ResponseField name="wallet_id" type="string">
    ID of the wallet that received the deposit.
  </ResponseField>

  <ResponseField name="asset" type="Object">
    Asset for the transaction.

    <Expandable title="child attributes" defaultOpen="true" defaultOpen="true">
      <ResponseField name="type" type="'native-token' | 'erc20' | 'spl'">
        Type of the asset for the transaction.
      </ResponseField>

      <ResponseField name="address" type="string">
        Contract address for an ERC20 asset, or mint address for an SPL asset. This field will only be included for the 'erc20' and 'spl' asset.types.
      </ResponseField>
    </Expandable>
  </ResponseField>

  <ResponseField name="amount" type="string">
    Absolute amount of the transaction. Denominated based on the asset (e.g. wei for EVM, or lamports
    for SOL). Stringified to maintain precision from BigInt.
  </ResponseField>

  <ResponseField name="transaction_hash" type="string">
    Hash for the transaction.
  </ResponseField>

  <ResponseField name="sender" type="string">
    Sender of the transaction.
  </ResponseField>

  <ResponseField name="recipient" type="string">
    Recipient of the transaction.
  </ResponseField>

  <ResponseField name="caip2" type="string">
    CAIP-2 chain ID of the network where the transaction happened.
  </ResponseField>

  <ResponseField name="block" type="Object">
    Information about the block for the transaction.

    <Expandable title="child attributes" defaultOpen="true" defaultOpen="true">
      <ResponseField name="number" type="number">
        Number of the block for the transaction.
      </ResponseField>
    </Expandable>
  </ResponseField>

  <ResponseField name="idempotency_key" type="string">
    An idempotent ID that uniquely identifies the deposit or withdrawal. In cases where the webhooks
    trigger more than once, the idempotency\_key will match.
  </ResponseField>
</Expandable>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n