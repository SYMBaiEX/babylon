# Remove signers

**Once** a wallet has [signers](/wallets/using-wallets/signers/add-signers), they may also revoke consent to prevent your app from taking any further wallet actions on their behalf.

<Tabs>
  <Tab title="React">
    To remove all the signers on the wallet, use the `removeSessionSigners` method from the `useSessionSigners` hook:

    ```tsx  theme={"system"}
    removeSessionSigners: async ({address: string}) => Promise<{user: User}>
    ```

    ### Usage

    ```tsx  theme={"system"}
    import {useSessionSigners} from '@privy-io/react-auth';
    ...
    const {removeSessionSigners} = useSessionSigners();
    ```

    When invoked, the `removeSessionSigners` method will remove all the signers, so only the user can transact on the wallet.

    <Warning>
      After this action, your app will no longer be able to take actions on behalf of the user with
      their wallet unless the user adds more [session
      signers](/wallets/using-wallets/signers/add-signers).
    </Warning>

    <Tip>
      Check out the [starter repo](https://github.com/privy-io/examples/blob/main/privy-next-starter/src/components/sections/session-signers.tsx)
      for an end to end example of how to use signers.
    </Tip>

    ### Parameters

    The `removeSessionSigners` method accepts a `params` object with the following fields:

    <ParamField path="address" type="string" required>
      Address of the embedded wallet to delegate.
    </ParamField>

    As an example, you might have a button within your app to allow users to remove all signers like so:

    ```tsx Example remove signers button theme={"system"}
    import {usePrivy, useSessionSigners, type WalletWithMetadata} from '@privy-io/react-auth';

    function RemoveSessionSignersButton() {
      const {user} = usePrivy();
      const {removeSessionSigners} = useSessionSigners();

      // Check if the user's wallets already has signers by searching the linkedAccounts array for wallets
      // with `delegated: true` set
      const delegatedWallet = user.linkedAccounts.filter(
        (account): account is WalletWithMetadata => account.type === 'wallet' && account.delegated
      );

      const onRevoke = async () => {
        if (!hasDelegatedWallets) return; // Button is disabled to prevent this case
        await removeSessionSigners({address: delegatedWallet.address});
      };

      return (
        <button disabled={!hasDelegatedWallets} onClick={onRevoke}>
          Revoke permission for this app to transact on my behalf
        </button>
      );
    }
    ```
  </Tab>

  <Tab title="React Native">
    To remove all the signers on the wallet, use the `removeSessionSigners` method from the `useSessionSigners` hook:

    ```tsx  theme={"system"}
    removeSessionSigners: async ({address: string}) => Promise<{user: PrivyUser}>;
    ```

    ### Usage

    ```tsx  theme={"system"}
    import {useSessionSigners} from '@privy-io/expo';
    ...
    const {removeSessionSigners} = useSessionSigners();
    ```

    When invoked, the `removeSessionSigners` method will remove all the signers, so only the user can transact on the wallet.

    <Warning>
      After this action, your app will no longer be able to take actions on behalf of the user with
      their wallet unless the user adds more [session
      signers](/wallets/using-wallets/signers/add-signers).
    </Warning>

    ### Parameters

    The `removeSessionSigners` method accepts a `params` object with the following fields:

    <ParamField path="address" type="string" required>
      Address of the embedded wallet to delegate.
    </ParamField>

    As an example, you might have a button within your app to allow users to remove all signers like so:

    ```tsx Example remove signers button theme={"system"}
    import {usePrivy, useSessionSigners, type PrivyEmbeddedWalletAccount} from '@privy-io/expo';

    function RemoveSessionSignersButton() {
      const {user} = usePrivy();
      const {removeSessionSigners} = useSessionSigners();

      // Check if the user's wallets already has signers by searching the linked_accounts array for wallets
      // with `delegated: true` set
      const delegatedWallet = user.linked_accounts.find(
        (account): account is PrivyEmbeddedWalletAccount =>
          account.type === 'wallet' && account.delegated
      );

      const onRevoke = async () => {
        if (!delegatedWallet) return; // Button is disabled to prevent this case
        await removeSessionSigners({address: delegatedWallet.address});
      };

      return (
        <Button disabled={!delegatedWallet} onPress={onRevoke}>
          Revoke permission for this app to transact on my behalf
        </Button>
      );
    }
    ```
  </Tab>

  <Tab title="NodeJS & REST API">
    Make a request to [update the wallet](/wallets/wallets/update-a-wallet) with the updated list of `additional_signers` you'd like on the wallet. The wallet owner must [sign](/controls/authorization-keys/using-owners/sign) the request.
  </Tab>
</Tabs>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n