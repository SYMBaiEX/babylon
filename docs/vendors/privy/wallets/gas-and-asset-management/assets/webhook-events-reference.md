# Webhook events reference

> Comprehensive reference for all webhook event types with example payloads

This reference provides detailed documentation for all webhook event types available in Privy, including example payloads for each event.

<Info>
  Webhooks is currently a scale feature. To use webhooks, please upgrade your account in the Privy
  Dashboard.
</Info>

## Webhook delivery

Privy sends webhooks to your configured endpoint via Svix. The webhook system operates on an **at least once** delivery basis with automatic retries if the endpoint does not successfully respond.

<Info>
  Redundant webhook deliveries can be identified using the `idempotency_key` field where available,
  ensuring your application can safely handle duplicate events.
</Info>

To set up webhooks, go to the [webhooks page](https://dashboard.privy.io/apps?page=webhooks) in the Privy Dashboard.

## Event structure

All webhook events follow a consistent structure with the event type included as a `type` field:

```json  theme={"system"}
{
  "type": "event.type"
  // Event-specific data
}
```

## User and authentication events

### `user.created`

Triggered when a new user is created in your app.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "user.created",
    "user": {
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "created_at": 1716153600,
      "linked_accounts": [],
      "mfa_methods": [],
      "has_accepted_terms": true,
      "is_guest": false
    }
  }
  ```
</Expandable>

### `user.authenticated`

Triggered when a user successfully authenticates with your app.

<Expandable title="Example payload (email authentication)">
  ```json  theme={"system"}
  {
    "type": "user.authenticated",
    "user": {
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "created_at": 1716153600,
      "linked_accounts": [
        {
          "type": "email",
          "address": "user@example.com",
          "verified_at": 1716153600,
          "first_verified_at": 1716153600,
          "latest_verified_at": 1716153600
        }
      ],
      "mfa_methods": [
        {
          "type": "totp",
          "verified_at": 1716153600
        }
      ],
      "has_accepted_terms": true,
      "is_guest": false
    },
    "account": {
      "type": "email",
      "address": "user@example.com",
      "verified_at": 1716153600,
      "first_verified_at": 1716153600,
      "latest_verified_at": 1716153600
    }
  }
  ```
</Expandable>

### `user.linked_account`

Triggered when a user links a new account (email, wallet, social, etc.) to their Privy account.

<Tabs>
  <Tab title="Email account">
    ```json  theme={"system"}
    {
      "type": "user.linked_account",
      "user": {
        "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
        "created_at": 1716153600,
        "linked_accounts": [],
        "mfa_methods": [],
        "has_accepted_terms": true,
        "is_guest": false
      },
      "account": {
        "type": "email",
        "address": "user@example.com",
        "verified_at": 1716153600,
        "first_verified_at": 1716153600,
        "latest_verified_at": 1716153600
      }
    }
    ```
  </Tab>

  <Tab title="Ethereum wallet">
    ```json  theme={"system"}
    {
      "type": "user.linked_account",
      "user": {
        "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
        "created_at": 1716153600,
        "linked_accounts": [],
        "mfa_methods": [],
        "has_accepted_terms": true,
        "is_guest": false
      },
      "account": {
        "type": "wallet",
        "address": "0x1234567890123456789012345678901234567890",
        "chain_type": "ethereum",
        "verified_at": 1716153600,
        "first_verified_at": 1716153600,
        "latest_verified_at": 1716153600,
        "wallet_client": "unknown",
        "wallet_client_type": "unknown",
        "connector_type": "unknown"
      }
    }
    ```
  </Tab>

  <Tab title="Google OAuth">
    ```json  theme={"system"}
    {
      "type": "user.linked_account",
      "user": {
        "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
        "created_at": 1716153600,
        "linked_accounts": [],
        "mfa_methods": [],
        "has_accepted_terms": true,
        "is_guest": false
      },
      "account": {
        "type": "google_oauth",
        "subject": "google-123",
        "email": "test@gmail.com",
        "name": "Test User",
        "verified_at": 1716153600,
        "first_verified_at": 1716153600,
        "latest_verified_at": 1716153600
      }
    }
    ```
  </Tab>
</Tabs>

### `user.unlinked_account`

Triggered when a user unlinks an account from their Privy account.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "user.unlinked_account",
    "user": {
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "created_at": 1716153600,
      "linked_accounts": [],
      "mfa_methods": [],
      "has_accepted_terms": true,
      "is_guest": false
    },
    "account": {
      "type": "email",
      "address": "user@example.com",
      "verified_at": 1716153600,
      "first_verified_at": 1716153600,
      "latest_verified_at": 1716153600
    }
  }
  ```
</Expandable>

### `user.updated_account`

Triggered when a user updates an existing linked account.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "user.updated_account",
    "user": {
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "created_at": 1716153600,
      "linked_accounts": [],
      "mfa_methods": [],
      "has_accepted_terms": true,
      "is_guest": false
    },
    "account": {
      "type": "email",
      "address": "user@example.com",
      "verified_at": 1716153600,
      "first_verified_at": 1716153600,
      "latest_verified_at": 1716153600
    }
  }
  ```
</Expandable>

### `user.transferred_account`

Triggered when an account is transferred from one user to another (typically during user merging).

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "user.transferred_account",
    "fromUser": {
      "id": "did:privy:clu2wsin402h9h9kt6ae7dfuh"
    },
    "toUser": {
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "created_at": 1716153600,
      "linked_accounts": [],
      "mfa_methods": [],
      "has_accepted_terms": true,
      "is_guest": false
    },
    "account": {
      "type": "email",
      "address": "user@example.com",
      "verified_at": 1716153600,
      "first_verified_at": 1716153600,
      "latest_verified_at": 1716153600
    },
    "deletedUser": true
  }
  ```
</Expandable>

### `user.wallet_created`

Triggered when a user creates a new embedded wallet.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "user.wallet_created",
    "user": {
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "created_at": 1716153600,
      "linked_accounts": [],
      "mfa_methods": [],
      "has_accepted_terms": true,
      "is_guest": false
    },
    "wallet": {
      "type": "wallet",
      "address": "0x123",
      "chain_type": "ethereum"
    }
  }
  ```
</Expandable>

## Transaction events

### `transaction.broadcasted`

Triggered when a transaction has been submitted to the network but has not yet been included in a block.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.broadcasted",
    "wallet_id": "wallet-123",
    "transaction_id": "tx-123",
    "caip2": "eip155:1",
    "transaction_hash": "0x123"
  }
  ```
</Expandable>

### `transaction.confirmed`

Triggered when a transaction has been included in at least one block that has been confirmed on the network.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.confirmed",
    "wallet_id": "wallet-123",
    "transaction_id": "tx-123",
    "caip2": "eip155:1",
    "transaction_hash": "0x123"
  }
  ```
</Expandable>

### `transaction.execution_reverted`

Triggered when a transaction's execution reverted (typically due to a smart contract error).

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.execution_reverted",
    "wallet_id": "r3mbxxfmzsuxxw3guxxha2xx",
    "transaction_id": "537e327d-7382-4e61-93e5-0241c72d0793",
    "caip2": "eip155:1",
    "transaction_hash": "0x123"
  }
  ```
</Expandable>

### `transaction.still_pending`

Triggered when a transaction is still pending after the expected confirmation time. Listen to this webhook to trigger [transaction speed-ups](/recipes/speeding-up-transactions).

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.still_pending",
    "wallet_id": "wallet-123",
    "transaction_id": "tx-123",
    "caip2": "eip155:1",
    "transaction_hash": "0x123",
    "transaction_request": {
      "from": "0x123",
      "to": "0x456",
      "value": "0x0",
      "data": "0x",
      "gas": "0x5208",
      "gasPrice": "0x4a817c800"
    }
  }
  ```
</Expandable>

<Info>
  Failures are uncommon overall, but more likely to occur on Base and Polygon than other chains
  (\<1% of transactions). To ensure transactions get confirmed, follow the guide on [transaction
  replacement](/recipes/speeding-up-transactions) to speed up stalled transactions.
</Info>

### `transaction.failed`

Triggered when a transaction has been pending for too long, signaling that it will not be included on-chain. This can happen when the gas fee is too low given the current activity on the blockchain.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.failed",
    "wallet_id": "wallet-123",
    "transaction_id": "tx-123",
    "caip2": "eip155:1",
    "transaction_hash": "0x123"
  }
  ```
</Expandable>

### `transaction.replaced`

Triggered when a transaction was replaced (e.g., speed-up or cancel operation). This is only applicable to EVM chains.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.replaced",
    "wallet_id": "wallet-123",
    "transaction_id": "tx-123",
    "caip2": "eip155:1",
    "transaction_hash": "0x123"
  }
  ```
</Expandable>

### `transaction.provider_error`

Triggered when a custodial wallet transaction request has been rejected by the custodian or encountered an error. This can happen when attempting to spend funds that haven't been fully screened by the custodian yet, or when a transaction does not meet the custodian's compliance requirements.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "transaction.provider_error",
    "wallet_id": "wallet-123",
    "transaction_id": "tx-123",
    "caip2": "eip155:1",
    "transaction_hash": "0x123"
  }
  ```
</Expandable>

## Wallet and funds events

### `wallet.funds_deposited`

Triggered when funds are deposited into a wallet.

<Tip>
  Deposit webhooks are available for select chains on Tier 3 and Tier 2. To see which exact chains
  are supported, go to the [Dashboard webhooks page](https://dashboard.privy.io/apps?page=webhooks).
</Tip>

<Tabs>
  <Tab title="Native token">
    ```json  theme={"system"}
    {
      "type": "wallet.funds_deposited",
      "wallet_id": "wallet-123",
      "idempotency_key": "124",
      "caip2": "eip155:1",
      "asset": {
        "type": "native-token",
        "address": null
      },
      "amount": "1000000000000000000",
      "transaction_hash": "0x456",
      "sender": "0x789",
      "recipient": "0xabc",
      "block": {
        "number": 12346
      }
    }
    ```
  </Tab>

  <Tab title="ERC-20 token">
    ```json  theme={"system"}
    {
      "type": "wallet.funds_deposited",
      "wallet_id": "wallet-123",
      "idempotency_key": "123",
      "caip2": "eip155:1",
      "asset": {
        "type": "erc20",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      },
      "amount": "10000000",
      "transaction_hash": "0x123",
      "sender": "0x456",
      "recipient": "0x789",
      "block": {
        "number": 12345
      }
    }
    ```
  </Tab>

  <Tab title="SPL token">
    ```json  theme={"system"}
    {
      "type": "wallet.funds_deposited",
      "wallet_id": "wallet-456",
      "idempotency_key": "125",
      "caip2": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "asset": {
        "type": "spl",
        "mint": "So11111111111111111111111111111111111111112"
      },
      "amount": "1000000000",
      "transaction_hash": "transaction-hash",
      "sender": "sender-address",
      "recipient": "recipient-address",
      "block": {
        "number": 123456789
      }
    }
    ```
  </Tab>
</Tabs>

<ResponseField name="idempotency_key" type="string">
  An idempotent ID that uniquely identifies the deposit. In cases where the webhook triggers more
  than once, the idempotency\_key will match.
</ResponseField>

<ResponseField name="amount" type="string">
  Absolute amount of the transaction. Denominated based on the asset (e.g. wei for EVM, or lamports
  for SOL). Stringified to maintain precision from BigInt.
</ResponseField>

### `wallet.funds_withdrawn`

Triggered when funds are withdrawn from a wallet.

<Tabs>
  <Tab title="Native token">
    ```json  theme={"system"}
    {
      "type": "wallet.funds_withdrawn",
      "wallet_id": "wallet-123",
      "idempotency_key": "124",
      "caip2": "eip155:1",
      "asset": {
        "type": "native-token",
        "address": null
      },
      "amount": "1000000000000000000",
      "transaction_hash": "0x456",
      "sender": "0x789",
      "recipient": "0xabc",
      "block": {
        "number": 12346
      }
    }
    ```
  </Tab>

  <Tab title="ERC-20 token">
    ```json  theme={"system"}
    {
      "type": "wallet.funds_withdrawn",
      "wallet_id": "wallet-123",
      "idempotency_key": "123",
      "caip2": "eip155:1",
      "asset": {
        "type": "erc20",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      },
      "amount": "10000000",
      "transaction_hash": "0x123",
      "sender": "0x456",
      "recipient": "0x789",
      "block": {
        "number": 12345
      }
    }
    ```
  </Tab>

  <Tab title="SPL token">
    ```json  theme={"system"}
    {
      "type": "wallet.funds_withdrawn",
      "wallet_id": "wallet-456",
      "idempotency_key": "125",
      "caip2": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "asset": {
        "type": "spl",
        "mint": "So11111111111111111111111111111111111111112"
      },
      "amount": "1000000000",
      "transaction_hash": "transaction-hash",
      "sender": "sender-address",
      "recipient": "recipient-address",
      "block": {
        "number": 123456789
      }
    }
    ```
  </Tab>
</Tabs>

## Security events

### `wallet.private_key_export`

Triggered when a user exports their private key from an embedded wallet.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "wallet.private_key_export",
    "user_id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
    "wallet_id": "wallet-123",
    "wallet_address": "0x123"
  }
  ```
</Expandable>

### `wallet.recovery_setup`

Triggered when a user sets up wallet recovery.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "wallet.recovery_setup",
    "user_id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
    "wallet_id": "wallet-123",
    "wallet_address": "0x123",
    "method": "recovery_encryption_key"
  }
  ```
</Expandable>

### `wallet.recovered`

Triggered when a user successfully recovers their wallet.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "wallet.recovered",
    "user_id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
    "wallet_id": "wallet-123",
    "wallet_address": "0x123"
  }
  ```
</Expandable>

## MFA events

### `mfa.enabled`

Triggered when multi-factor authentication is enabled for a user.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "mfa.enabled",
    "user_id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
    "method": "totp"
  }
  ```
</Expandable>

<Tip>**MFA methods:** sms, totp (authenticator app), passkey</Tip>

### `mfa.disabled`

Triggered when multi-factor authentication is disabled for a user.

<Expandable title="Example payload">
  ```json  theme={"system"}
  {
    "type": "mfa.disabled",
    "user_id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
    "method": "sms"
  }
  ```
</Expandable>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n