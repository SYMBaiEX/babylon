# Authorization keys

Authorization keys allow the party that controls the key to execute actions on wallets and policies by signing requests to the Privy API. Examples of authorization keys include a key controlled by your app's server or a passkey controlled by a user.

You can create authorization keys for your application via the **Privy Dashboard** or via the **REST API**.

<Tabs>
  <Tab title="Dashboard">
    To create a new authorization key in the Dashboard, visit the [**Authorization keys**](https://dashboard.privy.io/apps?page=authorization-keys) page of the **Wallets** section for your app.

    Click the **New key** button and copy and save the generated **Private key**. Privy does not save this key and cannot help you recover it later. You can also set a human-readable **Key name**.

    In this process, Privy generates a keypair for your app directly on your device, and shows you the private key.

    * The private key (e.g. the key you copy) is generated on your device, and is only ever known to your app. Neither Privy nor the secure enclave ever sees the private key, and cannot sign payloads with it. **Make sure you save this key.**
    * The public key is registered with the secure enclave that secures your wallets, and is used to verify signatures produced by your app.

    <Warning>
      Privy does not store the private key and cannot help you retrieve it.
    </Warning>
  </Tab>

  <Tab title="REST API">
    Authorization keys are [P-256](https://neuromancer.sk/std/nist/P-256) public-private keypairs. **Make sure to save the private key, as Privy does not store this and cannot help you recover it.**

    You can create a keypair with the following command:

    ```sh  theme={"system"}
    openssl ecparam -name prime256v1 -genkey -noout -out private.pem && \
    openssl ec -in private.pem -pubout -out public.pem
    ```

    This creates PEM-formatted files in your working directory for local storage. When registering the public key with the Privy API, you'll need to convert it to base64-encoded DER format:

    ```sh  theme={"system"}
    openssl ec -pubin -in public.pem -outform DER | base64
    ```

    Next, follow [this guide](/controls/key-quorum/create) to register your public key with the Privy API.

    <Tip>
      If you locally generate an authorization key and register it with the Privy API, make sure to note down the `id` in the response. You will use this value as the `owner_id` when specifying owners elsewhere (e.g. creating or updating wallets) or `signer_id` when specifying additional signers.
    </Tip>
  </Tab>

  <Tab title="Passkeys">
    Passkeys can be registered as authorization keys via either the Privy Dashboard or REST API. Simply follow the instructions in the Dashboard or REST API section to register the key, and pass the passkey's public key into the public key field of the request.
  </Tab>
</Tabs>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n