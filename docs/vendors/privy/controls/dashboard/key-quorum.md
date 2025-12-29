# Create a key quorum

To authorize actions like wallet updates, policy updates, signatures, and transactions via the Privy Dashboard, first create a [key quorum](/controls/key-quorum/overview) of team members to authorize actions. This quorum represents a group of "approvers" that can be assigned to authorize actions.

### Invite team members to your Privy account

To start, invite the team members that you'd like to include in your quorum to your Privy account from the [Account](https://dashboard.privy.io/account) page of the Dashboard. Make sure to give them either the **Developer** or **Admin** role to be enrolled in a key quorum.

### Enroll team members in MFA

To enroll in a key quorum, a team member in the Privy Dashboard **must** set up biometric or TOTP MFA for their account.

Have your team members enroll in MFA by clicking the profile icon at the bottom left corner of the Dashboard, selecting **Account preferences**, and then clicking **MFA enrollment**. Here, they will be prompted to enroll or update their MFA methods.

### Create a key quorum of team members

Finally, to create your key quorum, visit the [Authorization](https://dashboard.privy.io/apps?page=authorization-keys) page of the Privy Dashboard and click the **New key** button. In the modal that opens, select **Register key quorum**.

Set a **Name** for a quorum and select the team members you'd like to include in the quorum from the **Team members** dropdown. Only team members who have enrolled in MFA will be available as options to select.

Additionally, set the **Authorization threshold** for the quorum. This represents the number of members of the quorum that must approve an action to reach consensus.

### Assign the quorum as the owner of resources

Once your key quorum is created, note down the **ID** of the quorum.

When creating resources like wallets or policies that you'd like to manage via the Privy Dashboard, set this ID as the `owner_id` field of the resource creation request. This will set this key quorum as the resource's owner, and require it to approve actions like resource updates or wallet signatures and transactions.

<Columns cols={2}>
  <Card title="Create a wallet" icon="wallet" href="/api-reference/wallets/create">
    Create a wallet with your key quorum ID as the `owner_id`
  </Card>

  <Card title="Create a policy" icon="file" href="/api-reference/policies/create">
    Create a policy with your key quorum ID as the `owner_id`
  </Card>
</Columns>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n