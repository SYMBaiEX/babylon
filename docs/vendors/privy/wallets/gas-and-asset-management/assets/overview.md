# Wallet webhooks

Privy offers powerful **webhooks** that notify your application of updates to:

* [transaction statuses](/wallets/gas-and-asset-management/assets/transaction-event-webhooks)
* [incoming deposits](/wallets/gas-and-asset-management/assets/balance-event-webhooks)
* [outgoing withdrawals](/wallets/gas-and-asset-management/assets/balance-event-webhooks)

In addition, you can use Privy's [REST API](/wallets/gas-and-asset-management/assets/fetch-a-transaction) to query the transaction status and wallet balances.

Follow the guide below to set up webhooks for your app.

## Registering an endpoint

1. In your backend, create a new endpoint that will accept **POST** requests from Privy

   <Tip>
     When creating your endpoint to receive webhook events, always verify the payload signature by
     following our [webhook signing key
     documentation](/user-management/users/webhooks/handling-events#webhook-signing-key`).
   </Tip>

2. In the dashboard, go to the **Configuration > Webhooks** page

3. Add your new endpoint as the destination URL and select any event types you'd like to be notified for

You can specify which user events your webhook endpoint will be notified about. The options are as follows:

| Event Name               | Type                      | Action                                                                         |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------ |
| User created             | user.created              | A user was created in the application.                                         |
| User authenticated       | user.authenticated        | A user successfully logged into the application.                               |
| User linked account      | user.linked\_account      | A user successfully linked a new login method.                                 |
| User unlinked account    | user.unlinked\_account    | A user successfully unlinked an existing login method.                         |
| User updated account     | user.updated\_account     | A user successfully updates the email or phone number linked to their account. |
| User transferred account | user.transferred\_account | A user successfully transferred their account to a new account.                |
| Wallet created for user  | user.wallet\_created      | A wallet (embedded or smart wallet) was successfully created for a user.       |
| MFA enabled              | mfa.enabled               | A user has enabled MFA for their account.                                      |
| MFA disabled             | mfa.disabled              | A user has disabled MFA for their account.                                     |
| Private key exported     | private\_key.exported     | A user has exported their private key from an embedded wallet.                 |
| Wallet recovery setup    | wallet.recovery\_setup    | A user has set up wallet recovery for their embedded wallet.                   |
| Wallet recovered         | wallet.recovered          | A user has successfully recovered their embedded wallet.                       |

**That's it! You've successfully configured webhooks for your app.** 🎉

## Testing the webhook setup

<Accordion title="Quick testing guide">
  During development and testing, you can quickly verify your webhook endpoint is working correctly. Here's a simple step-by-step guide:

  #### Step 1: Expose your local endpoint

  If you're testing locally, you'll need to expose your local server to the internet. Use a tool like [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/):

  ```bash  theme={"system"}
  # Using ngrok (after installing: https://ngrok.com/download)
  ngrok http 3000

  # Or using Cloudflare Tunnel (after installing: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
  cloudflared tunnel --url http://localhost:3000
  ```

  Copy the public URL (e.g., `https://abc123.ngrok.io` or `https://abc123.trycloudflare.com`).

  #### Step 2: Create your webhook endpoint

  Create a simple endpoint in your backend that accepts POST requests:

  ```tsx  theme={"system"}
  import {NextRequest, NextResponse} from 'next/server';

  export async function POST(req: NextRequest) {
    const body = await req.json();

    // Log the webhook payload
    console.log('Webhook received:', body);

    // Return 200 to acknowledge receipt
    return NextResponse.json({received: true}, {status: 200});
  }
  ```

  #### Step 3: Register your endpoint in the dashboard

  1. Go to **Configuration > Webhooks** in the Privy Dashboard
  2. Add your public URL (from Step 1) as the webhook endpoint
  3. Select the event types you want to test

  #### Step 4: Test your endpoint

  Click the **"Test webhook"** button in the dashboard. This will send a test webhook (`privy.test`) to your endpoint with the following payload:

  ```json  theme={"system"}
  {
    "type": "privy.test",
    "message": "Hello, World!"
  }
  ```

  #### Step 5: Verify receipt

  Check your server logs to confirm you received the webhook. You should see:

  * The webhook payload in your console/logs
  * A successful 200 response returned to Privy

  <Tip>
    For quick testing, you can also use services like [webhook.site](https://webhook.site/) or
    [RequestBin](https://requestbin.com/) to get a temporary endpoint URL without setting up your own
    server.
  </Tip>
</Accordion>

## Retry behavior

Your endpoint must return a 2xx response for the webhook delivery to be considered successful. Anything else is considered an error response, and will be retried based on the following schedule, where each period is started following the failure of the preceding attempt:

* Immediately
* 5 seconds
* 5 minutes
* 30 minutes
* 2 hours
* 5 hours
* 10 hours
* 10 hours (in addition to the previous)

After the final attempt, the message will be marked as a failure, and must be manually retried from the dashboard. If all attempts to your endpoint fail for 5 consecutive days, your endpoint will be automatically disabled.

## Static IPs

Webhooks will be delivered from the following list of IP addresses:

```
44.228.126.217
50.112.21.217
52.24.126.164
54.148.139.208
2600:1f24:64:8000::/52
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n