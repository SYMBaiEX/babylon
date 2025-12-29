# Approve intents for execution

Once you've created intents to execute an action, team members in the corresponding key quorum can approve the intent via the Privy Dashboard.

To see intents for your application, visit the [Approvals](https://dashboard.privy.io/apps?page=approvals) of the Dashboard. From here, you can see a list of all intents, their type and corresponding resource, as well as the progress of their approval.

### Approving intents

View the **Pending your approval** section to find active intents that you can approve.

Select a given intent to view it. You can see details on who proposed the intent, what resource it affects, when it expires, and how many approvals have been collected from the respective key quorum.

You will also see a preview of the action for the intent:

* For wallet and policy updates, view a difference of the current state of the wallet/policy and the proposed state of the wallet/policy.
* For signatures and transactions, view a preview of the message being signed or the transaction being signed and/or broadcasted.

Once you've previewed the intent and have confirmed the changes, click the **Approve** button and complete MFA to approve the intent.

<Warning>
  Make sure to review an intent carefully before approving it. You cannot revoke approvals for
  intents after submitting them.
</Warning>

<Info>
  Under the hood, when a team member approves an action in the Dashboard, they provide an
  [authorization signature](/api-reference/authorization-signatures) over the request. Privy
  accumulates these signatures and executes the intent once the threshold is met.
</Info>

#### Intent execution

If your approval will satisfy the authorization threshold for the intent, **Privy will automatically execute the intent once you provide your approval.**

For example, if you create an intent to execute a transaction with a wallet, and the key quorum for the wallet has an authorization threshold of 3, if 2 approvals have already been provided, Privy will automatically execute the transaction upon the 3rd approval.

The final approver will be required to confirm that providing their approval will execute the intent.

### Rejecting intents

For intents created via the Privy Dashboard, the creator of the intent can reject the intent by selecting it from the [Approvals](https://dashboard.privy.io/apps?page=approvals) page and selecting **Cancel proposal**.

This will prevent other team members from being able to approve the intent going forward.

### Viewing intents

From the [Approvals](https://dashboard.privy.io/apps?page=approvals) page, you can also see all intents created for your application, not just those that are pending your approval.

<Tip>
  When viewing a particular intent, click the link icon at the top of the intent modal to copy a
  deeplink to the intent to your clipboard. You can share this link with other team members to
  easily share intents for viewing.
</Tip>

**Executed intents**

Intents with a status of **Executed** have received sufficient approvals and have been executed by the Privy API. Click into an **Executed** intent to see the action that was executed and its result.

**Pending intents**

Intents with a status of **Pending** still require more approvals in order to be authorized. Click into a **Pending** intent to see a preview of the proposed action and the progress of approvals.

**Expired intents**

Intents with a status of **Expired** can no longer be executed and expired after insufficient approvals were provided within 72 hours of intent creation.

**Rejected intents**

Intents with a status of **Rejected** can no longer be executed due to cancellation by the intent creator.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n