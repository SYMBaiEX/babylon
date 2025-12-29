# Handling events

When a user takes an action in your application, Privy will emit a webhooks payload with the following fields:

## Webhook example payloads

Webhook payloads generally have two different formats. Both formats include a `user` object that is the same structure as what [the user REST API](/user-management/users/the-user-object) returns. For webhook events that involve an account change, we will include an `account` object that represents the changed account. For example, in a `user.unlinked_account` event, the `account` value will be the account that was just removed, so it will no longer exist on the `user`.

Example payload for different webhook events:

<CodeGroup>
  ```json user.created theme={"system"}
  {
    "type": "user.created",
    "user": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        }
      ],
      "mfa_methods": []
    }
  }
  ```

  ```json user.authenticated theme={"system"}
  {
    "type": "user.authenticated",
    "account": {
      "address": "bilbo@privy.io",
      "first_verified_at": 969628260,
      "latest_verified_at": 969628260,
      "type": "email",
      "verified_at": 969628260
    },
    "user": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        }
      ],
      "mfa_methods": []
    }
  }
  ```

  ```json user.linked_account theme={"system"}
  {
    "type": "user.linked_account",
    "account": {
      "address": "bilbo@privy.io",
      "first_verified_at": 969628260,
      "latest_verified_at": 969628260,
      "type": "email",
      "verified_at": 969628260
    },
    "user": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        }
      ],
      "mfa_methods": []
    }
  }
  ```

  ```json user.wallet_created theme={"system"}
  {
    "type": "user.wallet_created"
    "user": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        }
      ],
      "mfa_methods": []
    },
    "wallet": {
      "type": "wallet",
      "address": "0x123...",
      "chain_type": "ethereum"
    }
  }
  ```

  ```json user.unlinked_account theme={"system"}
  {
    "type": "user.unlinked_account",
    "account": {
      "address": "bilbo@privy.io",
      "first_verified_at": 969628260,
      "latest_verified_at": 969628260,
      "type": "email",
      "verified_at": 969628260
    },
    "user": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        }
      ],
      "mfa_methods": []
    }
  }
  ```

  ```json user.updated_account theme={"system"}
  {
    "type": "user.updated_account",
    "account": {
      "address": "bilbo@privy.io",
      "first_verified_at": 969628260,
      "latest_verified_at": 969628260,
      "type": "email",
      "verified_at": 969628260
    },
    "user": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        }
      ],
      "mfa_methods": []
    }
  }
  ```

  ```json user.transferred_account theme={"system"}
  {
    "type": "user.transferred_account",
    "fromUser": {
      "id": "did:privy:clu2wsin402h9h9kt6ae7dfuh"
    },
    "toUser": {
      "created_at": 969628260,
      "has_accepted_terms": false,
      "id": "did:privy:cfbsvtqo2c22202mo08847jdux2z",
      "is_guest": false,
      "linked_accounts": [
        {
          "address": "bilbo@privy.io",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "email",
          "verified_at": 969628260
        },
        {
          "address": "+1234567890",
          "first_verified_at": 969628260,
          "latest_verified_at": 969628260,
          "type": "phone",
          "verified_at": 969628260
        }
      ]
    },
    "account": {
      "address": "+1234567890",
      "first_verified_at": 969628260,
      "latest_verified_at": 969628260,
      "type": "phone",
      "verified_at": 969628260
    },
    "deletedUser": true
  }
  ```

  ```json mfa.enabled theme={"system"}
  {
    "type": "mfa.enabled",
    "user_id": "user_123",
    "method": "sms"
  }
  ```

  ```json mfa.disabled theme={"system"}
  {
    "type": "mfa.disabled",
    "user_id": "user_123",
    "method": "sms"
  }
  ```

  ```json wallet.private_key_export theme={"system"}
  {
    "type": "wallet.private_key_export",
    "user_id": "user_123",
    "wallet_id": "wallet_123",
    "wallet_address": "0x123..."
  }
  ```

  ```json wallet.recovery_setup theme={"system"}
  {
    "type": "wallet.recovery_setup",
    "user_id": "user_123",
    "wallet_id": "wallet_123",
    "wallet_address": "0x123...",
    "method": "passkey"
  }
  ```

  ```json wallet.recovered theme={"system"}
  {
    "type": "wallet.recovered",
    "user_id": "user_123",
    "wallet_id": "wallet_123",
    "wallet_address": "0x123..."
  }
  ```

  ```json privy.test theme={"system"}
  {
    "type": "privy.test",
    "message": "Hello, World!"
  }
  ```
</CodeGroup>

You can find information about transaction and balance webhooks under [Gas and asset management](/wallets/gas-and-asset-management/assets/transaction-event-webhooks)

## Webhook signing key

The webhook signing key is necessary to verify that the payloads sent to your endpoint are from Privy. Follow the steps below in order to set up webhook verification in your backend.

<Accordion title="Verifying a webhook payload">
  Webhook payloads must be verified before they are trusted and used on your server. This is done by verifying a signature sent with your webhook. Privy uses [`svix`](https://www.svix.com/) for webhooks infrastructure.

  <Tip>
    Your endpoint must return a 2xx (status code 200-299) response for the webhook to be marked as
    delivered. Any other statuses (including 3xx) are considered failed deliveries. Your endpoint will
    be automatically disabled after 5 consecutive days of delivery failures
  </Tip>

  ## Using `@privy-io/server-auth`

  Use the **`PrivyClient`**'s **`verifyWebhook`** method to verify an incoming webhook. Pass in the request body, headers, and signing key (from the Privy Dashboard). As an example, for a NextJS API request, you can verify a webhook using the code below:

  ```tsx  theme={"system"}
  // req is an input of type `NextApiRequest`

  const privy = new PrivyClient(
    process.env.PRIVY_APP_ID as string,
    process.env.PRIVY_APP_SECRET as string
  );

  // Get the request's `id`, `timestamp`, and `signature`
  // These are sent in the `'svix-id'`, `'svix-timestamp'`, and `'svix-signature'` headers respectively
  const id = req.headers['svix-id'] ?? '';
  const timestamp = req.headers['svix-timestamp'] ?? '';
  const signature = req.headers['svix-signature'] ?? '';

  const verifiedPayload = await privy.verifyWebhook(
    req.body,
    {id, timestamp, signature},
    'insert-your-webhook-signing-key-from-the-dashboard'
  );
  ```

  If the webhook payload is valid, the method will return the payload back. If the webhook payload is invalid, the method will throw an error.

  ## Manual verification

  In order to verify an incoming webhook, please refer to svix's [manual verification guide](https://docs.svix.com/receiving/verifying-payloads/how-manual) or [library verification guide](https://docs.svix.com/receiving/verifying-payloads/how).
</Accordion>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n