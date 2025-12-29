# Create intents to execute actions

Next, for resources owned by your key quorum of team members, create **intents** to execute actions like wallet updates, policy updates, signatures, or transactions.

**Intents** are a resource in the Privy API that represent an intent to execute an action that will be **asynchronously** authorized by team members submitting approvals in the Privy Dashboard. Once a sufficient number of approvals is collected, the intent will be authorized and executed.

At a high-level, there are two ways to create intents in Privy:

* **Via the Dashboard:** From the **Wallets** and **Policies** pages of the Privy Dashboard, you can create an intent to update an existing wallet or policy that is owned by a key quorum of your team members.
* **Via the REST API:** From the REST API, you can create an intent to update a wallet, update a policy, or execute a signature or transaction.

<Info>
  Intents expire 72 hours after creation, and must be [approved](/controls/dashboard/approvals)
  within this window.
</Info>

Learn more below on creating intents for the following flows.

<Columns cols={3}>
  <Card title="Update wallet" icon="wallet" href="/controls/dashboard/intents#update-wallet">
    Create an intent to update a wallet
  </Card>

  <Card title="Update policy" icon="file" href="/controls/dashboard/intents#update-policy">
    Create an intent to update a policy
  </Card>

  <Card title="Execute signature or transaction" icon="key" href="/controls/dashboard/intents#execute-signature-or-transaction">
    Create an intent to execute a signature or transaction
  </Card>
</Columns>

***

## Update wallet

Create intents to update a wallet via the Privy Dashboard or REST API.

### Via the Dashboard

To create an intent to update a wallet via the Dashboard, visit the [**Wallets**](https://dashboard.privy.io/apps?page=wallets) page of the Dashboard and select your desired wallet.

Click **Update wallet** and make the changes you'd like to make. Finally, select **Propose changes** to create your intent to update the wallet.

### Via the REST API

To create an intent to update a wallet via the REST API, make a `PATCH` request to

```sh  theme={"system"}
https://api.privy.io/v1/apps/{app_id}/intents/wallets/{wallet_id}
```

This endpoint accepts the same request body as Privy's synchronous [**Update wallet**](/api-reference/wallets/update) endpoint, but does **not** require authorization signatures to be provided in the request. Instead, the intent will be authorized asyncrhonously and executed when sufficient authorizations have been met.

From the response, note the returned `intent_id`. You can use this ID later to view the status of the intent, how many authorizations have been collected, and what the execution status is.

View the full API reference for this endpoint below.

<Card title="Create an intent to update a wallet" icon="arrow-right" horizontal href="/api-reference/wallets/update-intent">
  View API reference for creating an intent to update a wallet.
</Card>

***

## Update policy

Create intents to update a policy via the Privy Dashboard or REST API.

### Via the Dashboard

To create an intent to update a wallet via the Dashboard, visit the [**Policies**](https://dashboard.privy.io/apps?page=policies) page of the Dashboard and select your desired policy.

Make your desired changes to the policy and click **Propose changes** to create your intent to update the policy.

### Via the REST API

To create an intent to update a policy via the REST API, make a `PATCH` request to

```sh  theme={"system"}
https://api.privy.io/v1/apps/{app_id}/intents/policies/{policy_id}
```

This endpoint accepts the same request body as Privy's synchronous [**Update policy**](/api-reference/policies/update) endpoint, but does **not** require authorization signatures to be provided in the request. Instead, the intent will be authorized asyncrhonously and executed when sufficient authorizations have been met.

From the response, note the returned `intent_id`. You can use this ID later to view the status of the intent, how many authorizations have been collected, and what the execution status is.

View the full API reference for this endpoint below.

<Card title="Create an intent to update a policy" icon="arrow-right" horizontal href="/api-reference/policies/update-intent">
  View API reference for creating an intent to update a policy.
</Card>

***

## Execute signature or transaction

Create intents to execute a signature or transaction via the REST API. Executing signatures and transactions currently cannot be initiated from the Privy Dashboard.

### Via the REST API

To create an intent to update a policy via the REST API, make a `POST` request to

```sh  theme={"system"}
https://api.privy.io/v1/apps/{app_id}/intents/wallets/{wallet_id}/rpc
```

This endpoint accepts the same request body as Privy's synchronous [**RPC**](/api-reference/wallets/ethereum/eth-send-transaction) endpoint, but does **not** require authorization signatures to be provided in the request. Instead, the intent will be authorized asynchronously and executed when sufficient authorizations have been met.

From the response, note the returned `intent_id`. You can use this ID later to view the status of the intent, how many authorizations have been collected, and what the execution status is.

View the full API reference for this endpoint below.

<Card title="Create an intent to execute a signature or transaction" icon="arrow-right" horizontal href="/api-reference/wallets/rpc-intent">
  View API reference for creating an intent to execute a signature or transaction
</Card>

***

## Update key quorum

You can also create an intent to update the key quorum of team members you initially created, to update the quorum's name, members, or authorization threshold.

This intent must be authorized by a sufficient number of members of the existing quorum in order to be executed.

### Via the Dashboard

To create an intent to update a key quorum via the Dashboard, visit the [**Authorization**](https://dashboard.privy.io/apps?page=authorization-keys) page of the Dashboard and select your desired key quorum.

Select **Update key quorum**, make your desired changes, and select **propose changes** to create your intent.

### Via the REST API

To create an intent to update a policy via the REST API, make a `PATCH` request to

```sh  theme={"system"}
https://api.privy.io/v1/apps/{app_id}/intents/key_quorums/{key_quorum_id}
```

This endpoint accepts the same request body as Privy's synchronous [**Update key quorum**](/api-reference/key-quorums/update) endpoint, but does **not** require authorization signatures to be provided in the request. Instead, the intent will be authorized asyncrhonously and executed when sufficient authorizations have been met.

From the response, note the returned `intent_id`. You can use this ID later to view the status of the intent, how many authorizations have been collected, and what the execution status is.

View the full API reference for this endpoint below.

<Card title="Create an intent to update a key quorum" icon="arrow-right" horizontal href="/api-reference/key-quorums/update-intent">
  View API reference for creating an intent to update a key quorum.
</Card>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n