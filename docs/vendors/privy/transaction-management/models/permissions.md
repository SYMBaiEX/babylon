# Permissions

Privy wallets support **granular permissions** that allow you to:

* Enable custom ownership configurations, with single-party, multi-party, or quorum approvals
* Delegate permissions to third-parties or act on behalf of third-parties given their consent
* Enforce policies defining the actions a wallet can perform

and more. These capabilities are powered by Privy's abstraction of **owners** and **signers**.

## Owners

The [**owner**](/controls/authorization-keys/owners/overview) of a wallet has full control over the wallet, and has the ability to take actions with the wallet, enforce policies on the wallet, delegate permissions to third-parties (signers), and export the wallet's private key.

Owners can be set up as an authorization key (similar to an API secret) controlled by your server, a user ID in your authentication system, or a quorum of the two. Generally, your business should configure the owner of the wallet to be its primary controller.

## Signers

Owners of wallets can delegate certain transaction capabilities to third-parties known as [**signers**](/controls/authorization-keys/owners/overview), or **additional signers**.

Signers enable your business to set up wallets with custom configurations such as:

* **Scoping wallet policies to specific parties.** When setting signers on a wallet, you can set the specific policies that the signer should be subject to, allowing you to scope permissions to different signers.
* **Enabling third-parties to take action on behalf of your business or your business to take action on behalf of third-parties.** For instance, your business may need to execute recurring transactions on behalf of a customer on a recurring basis, and can be granted the capability of a **signer** while the wallet is owned by the third-party.

## Permissions

Owners and signers have different permissions over wallets, as outlined below.

|                                 | Owners | Signers |
| ------------------------------- | ------ | ------- |
| Sign messages                   | ✅      | ✅       |
| Send transactions               | ✅      | ✅       |
| Update policies                 | ✅      | ❌       |
| Update owners                   | ✅      | ❌       |
| Update signers                  | ✅      | ❌       |
| Export wallet                   | ✅      | ❌       |
| Can be configured with policies | ✅      | ✅       |

## Common setups

Learn more about common setups for structuring permissions.

<CardGroup cols={2}>
  <Card title="Owners & signers" icon="lock" href="/controls/authorization-keys/owners/overview">
    Learn more about the details of owners and signers and how to leverage them for your business.
  </Card>

  <Card title="Common setups" icon="layer-group" href="/transaction-management/setups/delegation">
    Create granular permission models for your wallets with owners and signers.
  </Card>
</CardGroup>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n