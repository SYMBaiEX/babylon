# Dashboard controls

Privy enables you to securely manage resources like wallets and policies from the Privy Dashboard. You can set granular controls on these resources to require team members of your Privy account to explicitly authorize actions like wallet updates, policy updates, signatures, and transactions via the Dashboard.

<Tip>
  All authorizations performed through the Privy Dashboard are secured by biometric and/or TOTP MFA.
</Tip>

<img src="https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=33b7968e481ed22460e5eea696b162b0" alt="images/dashboard-approvals-splash.png" data-og-width="4500" width="4500" data-og-height="3000" height="3000" data-path="images/dashboard-approvals-splash.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?w=280&fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=8206148f75f7671786cfdef42bc3e743 280w, https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?w=560&fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=0da635ba2c8932f4e26c94c2735f68cc 560w, https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?w=840&fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=001b95609525cbe9184611690ff6ed2b 840w, https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?w=1100&fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=5bd130eb0629e032e6226cfef6634940 1100w, https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?w=1650&fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=9e20a31b308a6531e7b95d36868e55f5 1650w, https://mintcdn.com/privy-c2af3412/wzqLpH4VYhrb0ndO/images/dashboard-approvals-splash.png?w=2500&fit=max&auto=format&n=wzqLpH4VYhrb0ndO&q=85&s=21e2301dc07559a8108e800880cf1afb 2500w" />

<Info>
  Dashboard controls over wallets and policies is a gated feature. Reach out to
  [sales@privy.io](mailto:sales@privy.io) to request access for your app.
</Info>

## Overview

At a high-level, to configure Privy resources by wallets and policies to be managed via the Dashboard:

<Steps>
  <Step title="Create a key quorum of team members">
    In the Privy Dashboard, create a [key quorum](/controls/key-quorum/overview) consisting of team members of your Privy account. Configure the members of the quorum and the threshold of members required for the quorum to reach consensus.

    This quorum can later approve actions like wallet updates, policy updates, signatures, and transactions via the Dashboard. A sufficient number of members of the quorum must approve the action to authorize its execution in the Privy API.
  </Step>

  <Step title="Assign the key quorum as the owner of the resource or a signer">
    When creating a resource like a [wallet](/api-reference/wallets/create) or a [policy](/api-reference/policies/create) in the Privy API, assign the key quorum as the [owner](/controls/authorization-keys/owners/overview) of the resource. As owner, the key quorum will be required to authorize any updates to the wallet or the policy.

    For wallets, the key quorum will also be required to authorize any signatures or transactions executed by the wallet. You can alternatively add the key quorum as a [signer](/controls/authorization-keys/owners/overview) on the wallet to give it permission to authorize certain signatures and transactions without the ability to update the wallet itself.
  </Step>

  <Step title="Create an intent to execute an action">
    Next, via the Privy API or Dashboard, create an **intent** to execute an action, like updating wallets, updating policies, or executing signatures or transactions.

    Once the intent is created, the intent will be queued for approval in the Privy Dashboard for the team members that own the resource.
  </Step>

  <Step title="Approve the intent to authorize execution">
    Finally, team members can approve the intent via the **Approvals** page of the Privy Dashboard. Approvals are secured by biometric or TOTP MFA.

    Once a sufficient number of team members approve the intent, based on the threshold set for your key quorum, the intent will be executed via the Privy API – the wallet will be updated, the policy will be updated, or the signature or transaction will be executed.
  </Step>
</Steps>

## Get started

Get started with Dashboard controls with the guides below.

<Columns cols={2}>
  <Card title="Create key quorums" icon="users" href="/controls/dashboard/key-quorum">
    Create key quorums of your team members in the Privy Dashboard.
  </Card>

  <Card title="Create intents for execution" icon="shield" href="/controls/dashboard/key-quorum">
    Create intents to update a wallet, update a policy, or execute a signature or transaction.
  </Card>

  <Card title="Approve intents" icon="fingerprint" href="/controls/dashboard/key-quorum">
    Approve intents to authorize their execution
  </Card>

  <Card title="Get intent status" icon="code" href="/controls/dashboard/key-quorum">
    Get the status of an intent and the result of their execution
  </Card>
</Columns>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n