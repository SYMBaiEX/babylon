# Key quorums

An owner or a signer can also be composed of a mix of [users](/controls/authorization-keys/keys/create/user/overview) and [authorization keys](/controls/authorization-keys/keys/create/key). This is known as a key quorum.

Key quorums have an authorization threshold that defines how many keys in the quorum must sign a request for the aggregated signature to be valid. You can use key quorums to implement use cases such as:

* Allowing users *or* apps to sign requests from user wallets
* Requiring both users *and* apps to sign requests from user wallets
* Requiring a distributed set of authorization keys to sign requests from a wallet

Learn more about key quorums in the [**Key quorums**](/controls/key-quorum/overview) section.

<Tip>
  Key quorums are an advanced integration. To determine if key quorums are right for your use case,
  please [reach out](https://privy.io/slack).
</Tip>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n