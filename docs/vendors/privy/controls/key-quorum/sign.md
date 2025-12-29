# Signing requests with key quorums

To sign a request with a key quorum:

1. Collect the private keys for a threshold of authorization keys in the key quorum. For example, if your key quorum is configured with an *m*-of-*n* authorization threshold, you must have the private keys for at least *m* of the authorization keys in the key quorum. For users in your key quorum, request the user key per [this guide](/controls/authorization-keys/keys/create/user/request).
2. [Sign the request](/controls/authorization-keys/using-owners/sign) with each authorization key individually.
3. Pass the signatures as a comma-delimited string in the `privy-authorization-signature` header for your requests to the Privy API.

An example request signed by a *2*-of-*n* key quorum might look as follows

<Tabs>
  <Tab title="REST API">
    ```bash  theme={"system"}
    curl --request POST https://api.privy.io/v1/wallets/y5ofctvacjiv53u4hmnqi0e5/rpc \
    -u "<your-privy-app-id>:<your-privy-app-secret>" \
    -H "privy-app-id: <your-privy-app-id>" \
    -H "privy-authorization-signature: <insert-authorization-sig1>,<insert-authorization-sig2>" \
    -H 'Content-Type: application/json' \
    -d '{
      "caip2": "eip155:1",
      "method": "eth_sendTransaction",
      "params": {
        "transaction": {
          "to": "0xE3070d3e4309afA3bC9a6b057685743CF42da77C",
          "value": "0x2386f26fc10000",
          "data": "0x"
        }
      }
    }'
    ```
  </Tab>

  <Tab title="NodeJS">
    <Info>
      This guide is for the **`@privy-io/node`** library only, as the feature is not available in the
      **`@privy-io/server-auth`** library.
    </Info>

    Use the [`AuthorizationContext`](/controls/authorization-keys/using-owners/sign/signing-on-the-server) to set the authorization key(s) in the quorum to use for signing the request.

    ```ts title="Example: Using ethereum eth_sendTransaction" focus={22-27} theme={"system"}
    import {PrivyClient} from '@privy-io/node';

    const privyClient = new PrivyClient({
      appId: 'insert-your-app-id',
      appSecret: 'insert-your-app-secret'
    });

    try {
      const caip2 = 'eip155:1'; // Ethereum mainnet
      const response = await privyClient
        .wallets()
        .ethereum()
        .sendTransaction('insert-user-wallet-id', {
          caip2,
          params: {
            transaction: {
              to: '0xE3070d3e4309afA3bC9a6b057685743CF42da77C',
              value: '0x2386f26fc10000',
              data: '0x'
            }
          },
          authorization_context: {
            // Example: building an authorization context for a 2-of-2 key quorum,
            // consisting of a user and authorization key
            authorization_private_keys: ['authorization-key'],
            user_jwts: ['user-jwt']
          }
        });

      const transactionHash = response.hash;
    } catch (error) {
      console.error(error);
    }
    ```
  </Tab>

  <Tab title="Java">
    Use the [`AuthorizationContext` builder](/controls/authorization-keys/using-owners/sign/signing-on-the-server) to set the authorization key(s) in the quorum to use for signing the request.

    ```java title="Example: Using ethereum eth_sendTransaction" focus={9-13,15,23} theme={"system"}
    try {
        String caip2 = "eip155:1"; // Ethereum mainnet
        EthereumSendTransactionRpcInputTransaction txn = EthereumSendTransactionRpcInputTransaction.builder()
            .to("0xE3070d3e4309afA3bC9a6b057685743CF42da77C")
            .value(EthereumSendTransactionRpcInputValue.of("0x2386f26fc10000"))
            .data("0x")
            .build();

        // Example: Building an authorization context for a 2-of-2 key quorum, consisting of a user and authorization key
        AuthorizationContext authorizationContext = AuthorizationContext.builder()
            .addUserJwt("user-jwt")
            .addAuthorizationPrivateKey("authorization-key")
            .build();

        // Pass the authorization context to the method to have the SDK automatically sign the request
        EthereumSendTransactionRpcResponseData response = privyClient
            .wallets()
            .ethereum()
            .sendTransaction(
                walletId,
                caip2,
                txn,
                authorizationContext
            );

        String transactionHash = response.hash();
    } catch (APIException e) {
        String errorBody = e.bodyAsString();
        System.err.println(errorBody);
    } catch (Exception e) {
        System.err.println(e.getMessage());
    }
    ```
  </Tab>

  <Tab title="Rust">
    Use the [`AuthorizationContext`](/controls/authorization-keys/using-owners/sign/signing-on-the-server) to set the authorization key(s) in the quorum to use for signing the request.

    ```rust title="Example: Using ethereum eth_sendTransaction" focus={7-10} theme={"system"}
    use privy_rs::{PrivyClient, AuthorizationContext, JwtUser, PrivateKey, generated::types::*};

    let client = PrivyClient::new(app_id, app_secret)?;

    // Example: Building an authorization context for a 2-of-2 key quorum,
    // consisting of a user and authorization key
    let auth_ctx = AuthorizationContext::new()
        .push(JwtUser(client.clone(), "user-jwt".to_string()))
        .push(PrivateKey("authorization-key".to_string()));

    let request = EthereumSendTransactionRpcInput {
        method: "eth_sendTransaction".to_string(),
        caip2: "eip155:1".to_string(), // Ethereum mainnet
        sponsor: None,
        params: EthereumSendTransactionRpcInputParams {
            transaction: EthereumSendTransactionRpcInputParamsTransaction {
                to: Some("0xE3070d3e4309afA3bC9a6b057685743CF42da77C".to_string()),
                value: Some("0x2386f26fc10000".to_string()),
                data: Some("0x".to_string()),
                gas: None,
                gas_price: None,
                nonce: None,
            }
        }
    };

    let response = client
        .wallets()
        .ethereum()
        .send_transaction("wallet-id", request, &auth_ctx, None)
        .await?;

    let transaction_hash = response.data.transaction_hash;
    println!("Transaction hash: {}", transaction_hash);
    ```

    ### Parameters and Returns

    See the Rust SDK documentation for detailed parameter and return types, including embedded examples:

    * [EthereumService::send\_transaction](https://docs.rs/privy-rs/latest/privy_rs/ethereum/struct.EthereumService.html#method.send_transaction)

    For more details on AuthorizationContext, see the [authorization context guide](/controls/authorization-keys/using-owners/sign/signing-on-the-server#rust).
  </Tab>
</Tabs>

When the API receives the request, Privy validates that:

1. The required number of signatures are provided.
2. All signatures are valid for the request payload.
3. All signatures come from authorization keys in the key quorum for the wallet.

If any validation fails, the request is rejected.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n