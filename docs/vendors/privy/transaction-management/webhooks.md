# Webhooks

Privy offers powerful **webhooks** that allow your app to easily monitor and consume **transaction status updates**, **deposits**, and **withdrawals**. Privy handles the logic of keeping your service in sync with the blockchain, and your business can handle its core function.

## Blockchain monitoring

Webhooks provide your application with the following blockchain monitoring capabilities.

### Transaction status API

Fetch transaction details and status, like confirmations, failures, and delays, via API to keep your application in sync.

### Transaction status webhooks

Receive notifications when transactions are broadcasted, confirmed, failed, and more.

### Deposit webhooks

Get notified when your wallets receive registered assets on a variety of chains.

### Withdrawal webhooks

Get notified when your wallets spend registered assets on a variety of chains.

## Usage

Learn more about using webhooks below.

<CardGroup cols={3}>
  <Card icon="money-bill-transfer" href="/wallets/gas-and-asset-management/assets/balance-event-webhooks">
    Webhook notifications on deposits and withdrawals.
  </Card>

  <Card icon="network-wired" href="/wallets/gas-and-asset-management/assets/transaction-event-webhooks">
    Webhook notifications on transaction status updates.
  </Card>

  <Card icon="server" href="/wallets/gas-and-asset-management/assets/fetch-a-transaction">
    Fetch transaction status with the REST API.
  </Card>
</CardGroup>

## Webhook details

<Tip>
  Learn more about the registering and using webhooks
  [here](/wallets/gas-and-asset-management/assets/overview).
</Tip>

To use webhooks, simply register a webhook endpoint in the Privy Dashboard. Privy will fire webhooks on your selected events with a signed payload to your server, which you can verify and capture in your own state management.

### Retries

Webhooks are retried if your server returns something other than a 2xx response, at increasingly long intervals up to 5 days. Webhooks also include an idempotency key to help ensure that your server does not consume the same webhook twice.

### Static IPs

Webhoooks are delivered by a static set of IPs that your server can allowlist for incoming network requests.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n