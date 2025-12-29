# Get intent status and execution results

Once an intent has been created, you can get the intent's status from the Privy API via the intent's ID. If the intent has been executed, you can also get the result of execution.

To get the status of an intent, make a `GET` request to:

```sh  theme={"system"}
https://api.privy.io/v1/apps/{app_id}/intents/{intent_id}
```

using the intent ID returned from the Privy API or displayed in the Privy Dashboard.

From the response, you can extract key information such as:

| Field                     | Description                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created_by_display_name` | The email address of the creator of the intent.                                                                                                                                       |
| `authorizations`          | A list of team members that have submitted approvals for the intent.                                                                                                                  |
| `status`                  | The status of the intent (`'pending'`, `'granted'`, `'executed'`, `'rejected'`, `'expired'`).                                                                                         |
| `expires_at`              | UNIX timestamp for when the intent expires.                                                                                                                                           |
| `request_details`         | The request body corresponding to the action for the intent (e.g., the request body to update a wallet, update a policy, or execute a signature or transaction).                      |
| `action_result`           | If the intent was executed, the response body corresponding to intent execution (e.g., the response body to update a wallet, update a policy, or execute a signature or transaction). |

### Consuming the result of intent execution

Use the `action_result` field to consume the result of intent execution. For example, if you created an intent to sign a message or send a transaction, you can consume the signature or transaction hash from the `action_result` field of the response.

### API reference

View the full API reference for this endpoint below.

<Card title="Get intent" icon="arrow-right" horizontal href="/api-reference/intents/get">
  View API reference for getting the status of an intent and the result of its execution.
</Card>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n