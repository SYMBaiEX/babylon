# Overview

<Tip>
  Key quorums are an advanced feature. [Reach out](https://privy.io/slack) to discuss whether this
  setup is right for your integration.
</Tip>

Key quorums define how ownership and authorization work. A quorum is a set of authorization keys and/or users that control a resource (such as a wallet or policy) in the Privy API.

Key quorums can be configured such that a **quorum** of *m*-of-*n* of the keys in the set must sign requests to the Privy API. This authorization threshold gives you flexible, production-grade control over how sensitive operations are approved. Key quorums enable setups such as:

* **Fine-grained ownership model**: Decide which actions require a user signature, an authorization key, or both.
* **Distributed authorization**: Require signatures from multiple authorization keys running across different servers.
* **Multi-signature security**: Enforce independent approvals for high-risk or high-value operations.

Learn more about how to create key quorums and sign requests with the guides below.

<CardGroup cols={2}>
  <Card title="Create key quorums" href="/controls/key-quorum/create">
    Create key quorums from authorization keys.
  </Card>

  <Card title="Sign requests" href="/controls/key-quorum/sign">
    Sign requests with a quorum of *m*-of-*n* keys.
  </Card>
</CardGroup>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n