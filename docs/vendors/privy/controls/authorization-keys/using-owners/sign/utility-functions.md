# Signing with utility functions

If your integration cannot leverage the [automatic signing](/controls/authorization-keys/using-owners/sign/signing-on-the-server) capabilities of Privy's SDKs, Privy also offers utility functions for formatting and signing requests.

You can use these functions to sign requests, even without initializing an instance of the Privy SDK, and then can manually include the returned signature in requests to the Privy API.

## Client-side SDKs

At a high-level, you can use Privy's client-side SDKs' utility functions to sign requests like so:

<Steps>
  <Step title="Construct your signature payload">
    Determine the request you intend to make to the Privy API and format it into the required
    signature payload, including request headers, method, body, URL, etc.
  </Step>

  <Step title="Sign the request">
    Next, sign the payload using the SDK's `generateAuthorizationSignature` method.
  </Step>

  <Step title="Send the request payload and signature to your backend">
    Make a request to your server, including both the request payload and signature from step (1).
    Your backend will proxy this request with the signature to Privy's REST API.
  </Step>

  <Step title="Send the request to the Privy API">
    From your server, make a request to Privy's REST API with your desired request payload. Include
    the signature in the `privy-authorization-signature` header of the request.
  </Step>
</Steps>

### 1. Construct and sign your request

Given your desired request to the Privy API, build a JSON payload with the following fields. Your application will sign this entire payload to authorize the request to the Privy API.

| Field                              | Type                                                                                                                                                                                                                                                  | Description                                                                                                                                                                                                       |   |   |   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | - | - | - |
| `version`                          | `1`                                                                                                                                                                                                                                                   | Authorization signature version. Currently, `1` is the only version.                                                                                                                                              |   |   |   |
| `method`                           | `'POST'  \| 'PUT'                                                                                                                                                                                                             \| 'PATCH' \| 'DELETE'` | HTTP method for the request. Signatures are not required on `'GET'` requests.                                                                                                                                     |   |   |   |
| `url`                              | `string`                                                                                                                                                                                                                                              | The full URL for the request. Should not include a trailing slash.                                                                                                                                                |   |   |   |
| `body`                             | `JSON`                                                                                                                                                                                                                                                | JSON body for the request.                                                                                                                                                                                        |   |   |   |
| `headers`                          | `JSON`                                                                                                                                                                                                                                                | JSON object containing any Privy-specific headers, e.g. those that are prefixed with `'privy-'`. This should **not** include any other headers, such as authentication headers, `content-type`, or trace headers. |   |   |   |
| `headers['privy-app-id']`          | `string`                                                                                                                                                                                                                                              | Privy app ID header (required).                                                                                                                                                                                   |   |   |   |
| `headers['privy-idempotency-key']` | `string`                                                                                                                                                                                                                                              | Privy idempotency key header (optional). If the request does not contain an idempotency key, leave this field out of the payload.                                                                                 |   |   |   |

As an example, you might build a payload for an Ethereum `personal_sign` RPC request like so:

```ts  theme={"system"}
const signaturePayload = {
  version: 1,
  url: 'https://api.privy.io/v1/wallets/<insert-wallet-id>/rpc',
  method: 'POST',
  headers: {
    'privy-app-id': '<insert-app-id>'
  },
  body: {
    method: 'personal_sign',
    params: {
      message: 'Hello from Privy!',
      encoding: 'utf-8'
    }
  }
} as const;
```

### 2. Sign your request

Next, use the React or React Native SDKs' `generateAuthorizationSignature` method from the `useAuthorizationSignature` hook to sign the request. Pass the payload from step (1) as a parameter to this method.

The method will sign the request with the current authenticated user's signing key, and return a `Promise` for the base64-encoded signature.

<CodeGroup>
  ```tsx React theme={"system"}
  import {useAuthorizationSignature} from '@privy-io/react-auth';

  const {generateAuthorizationSignature} = useAuthorizationSignature();

  // Sign the request using the current authenticated user's signing key.
  // The `signaturePayload` here refers to the JSON payload constructed in step (1).
  const authorizationSignature = await generateAuthorizationSignature(signaturePayload);
  ```

  ```tsx React Native theme={"system"}
  import {useAuthorizationSignature} from '@privy-io/expo';

  const {generateAuthorizationSignature} = useAuthorizationSignature();

  // Sign the request using the current authenticated user's signing key.
  // The `signaturePayload` here refers to the JSON payload constructed in step (1).
  const authorizationSignature = await generateAuthorizationSignature(signaturePayload);
  ```
</CodeGroup>

### 3. Send the request and signature to your backend

Next, make a request from your frontend to your backend including the request you intend to make to the Privy API and the corresponding signature from step (2). Your backend will proxy this request to the Privy API.

### 4. Send the request to the Privy API

Finally, make your request to the Privy API and include the signature in the `privy-authorization-signature` header for your request. As an example, in NodeJS, you can make the request like so:

```ts  theme={"system"}
fetch('https://api.privy.io/v1/wallets/<insert-wallet-id>/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Basic ${btoa('<insert-app-id>:<insert-app-secret>')}`,
    'privy-app-id': '<insert-app-id>',
    'privy-authorization-signature': '<insert-base64-encoded-signature>'
  },
  body: JSON.stringify({
    method: 'personal_sign',
    params: {
      message: 'Hello from Privy!',
      encoding: 'utf-8'
    }
  })
})
  .then((res) => console.log(res))
  .catch((err) => console.error(err));
```

## Server-side SDKs

Privy's server SDKs offer two utilities for signing requests:

* **Formatting requests for authorization signatures.** This accepts your desired request to the Privy API and formats it into the required signature payload to be signed.
  * This utility is particularly helpful if your application signs requests via a separate service, e.g. an isolated KMS. Your primary server can format your request and generate the signature payload and call out to your signing service with the payload.
* **Generating authorization signatures.** This accepts a formatted signature payload and signs it with your provided signing key.
  * This utility is particularly useful within a specific signing service. Within your signing service, you can import this function and use it to sign requests, and return the signature to your primary service.

### Constructing your input

Both the formatting and signing functions of Privy's SDKs require a JSON input with the following fields:

| Field                              | Type                                                                                                                                                                                                                                                  | Description                                                                                                                                                                                                       |   |   |   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | - | - | - |
| `version`                          | `1`                                                                                                                                                                                                                                                   | Authorization signature version. Currently, `1` is the only version.                                                                                                                                              |   |   |   |
| `method`                           | `'POST'  \| 'PUT'                                                                                                                                                                                                             \| 'PATCH' \| 'DELETE'` | HTTP method for the request. Signatures are not required on `'GET'` requests.                                                                                                                                     |   |   |   |
| `url`                              | `string`                                                                                                                                                                                                                                              | The full URL for the request. Should not include a trailing slash.                                                                                                                                                |   |   |   |
| `body`                             | `JSON`                                                                                                                                                                                                                                                | JSON body for the request.                                                                                                                                                                                        |   |   |   |
| `headers`                          | `JSON`                                                                                                                                                                                                                                                | JSON object containing any Privy-specific headers, e.g. those that are prefixed with `'privy-'`. This should **not** include any other headers, such as authentication headers, `content-type`, or trace headers. |   |   |   |
| `headers['privy-app-id']`          | `string`                                                                                                                                                                                                                                              | Privy app ID header (required).                                                                                                                                                                                   |   |   |   |
| `headers['privy-idempotency-key']` | `string`                                                                                                                                                                                                                                              | Privy idempotency key header (optional). If the request does not contain an idempotency key, leave this field out of the payload.                                                                                 |   |   |   |

### Formatting requests

Use the SDK's formatting function to generate your signature payload. As a parameter to this function, pass the JSON object as defined above.

<CodeGroup>
  ```ts NodeJS theme={"system"}
  import {
    formatRequestForAuthorizationSignature,
    type WalletApiRequestSignatureInput
  } from '@privy-io/node';

  // Replace this with your desired request to the Privy API, including
  // url, method, headers, and body.
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: 'https://api.privy.io/v1/wallets/<insert-wallet-id>/rpc',
    method: 'POST',
    headers: {
      'privy-app-id': '<insert-app-id>'
    },
    body: {
      method: 'personal_sign',
      params: {
        message: 'Hello from Privy!',
        encoding: 'utf-8'
      }
    }
  };
  const serializedPayload = formatRequestForAuthorizationSignature(input);
  ```

  ```ts NodeJS (@privy-io/server-auth) theme={"system"}
  import {formatRequestForAuthorizationSignature} from '@privy-io/server-auth/wallet-api';

  // Replace this with your desired request to the Privy API, including
  // url, method, headers, and body.
  const input = {
    version: 1,
    url: 'https://api.privy.io/v1/wallets/<insert-wallet-id>/rpc',
    method: 'POST',
    headers: {
      'privy-app-id': '<insert-app-id>'
    },
    body: {
      method: 'personal_sign',
      params: {
        message: 'Hello from Privy!',
        encoding: 'utf-8'
      }
    }
  } as const;
  const serializedPayload = formatRequestForAuthorizationSignature({input});
  ```

  ```java Java theme={"system"}
  // Build the request, in this case an ethereum personal_sign request
  EthereumPersonalSignRpcInputParams params = EthereumPersonalSignRpcInputParams.builder()
      .message(message)
      .encoding(Encoding.of(EncodingUtf8.UTF8))
      .build();

  EthereumPersonalSignRpcInput request = EthereumPersonalSignRpcInput.builder()
      .method(EthereumPersonalSignRpcInputMethod.PERSONAL_SIGN)
      .params(params)
      .build();

  byte[] serializedPayload = privyClient.utils()
      .requestFormatter()
      .formatRequestForAuthorizationSignature(
          new WalletApiRequestSignatureInput(
              1,
              request,
              HttpMethod.POST,
              "https://api.privy.io/wallets/<insert-wallet-id>/rpc",
              null
          )
      );
  ```

  ```rust Rust theme={"system"}
  use privy_rs::format_request_for_authorization_signature;
  use privy_rs::generated::types::*;

  // Build the request, in this case an ethereum personal_sign request
  let params = EthereumPersonalSignRpcInputParams {
      message: "Hello from Privy!".to_string(),
      encoding: Some(EthereumPersonalSignRpcInputParamsEncoding::Utf8),
  };

  let request = EthereumPersonalSignRpcInput {
      method: EthereumPersonalSignRpcInputMethod::PersonalSign,
      params,
  };

  let encoded_request_payload = format_request_for_authorization_signature(
      &app_id,
      crate::Method::POST,
      "https://api.privy.io/wallets/<insert-wallet-id>/rpc".to_string(),
      &request,
      None,
  )?;
  ```
</CodeGroup>

You can then take the returned serialized payload and call out to a signing service to generate a P256 signature over the payload.

### Signing requests

To directly produce a signature over a request, use the SDK's generate authorization signature method. As a parameter to this method, pass the JSON object as defined above.

<CodeGroup>
  ```ts Node theme={"system"}
  import {generateAuthorizationSignature, type WalletApiRequestSignatureInput} from '@privy-io/node';

  // Replace this with your desired request to the Privy API, including
  // url, method, headers, and body.
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: 'https://api.privy.io/v1/wallets/<insert-wallet-id>/rpc',
    method: 'POST',
    headers: {
      'privy-app-id': '<insert-app-id>'
    },
    body: {
      method: 'personal_sign',
      params: {
        message: 'Hello from Privy!',
        encoding: 'utf-8'
      }
    }
  };
  // Pass your base64 encoded authorization private key as `authorizationPrivateKey`
  const signature = generateAuthorizationSignature({
    input,
    authorizationPrivateKey: 'insert-private-key'
  });
  ```

  ```ts Node (@privy-io/server-auth) theme={"system"}
  import {generateAuthorizationSignature, type WalletApiRequestSignatureInput} from '@privy-io/node';

  // Replace this with your desired request to the Privy API, including
  // url, method, headers, and body.
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: 'https://api.privy.io/v1/wallets/<insert-wallet-id>/rpc',
    method: 'POST',
    headers: {
      'privy-app-id': '<insert-app-id>'
    },
    body: {
      method: 'personal_sign',
      params: {
        message: 'Hello from Privy!',
        encoding: 'utf-8'
      }
    }
  };
  // Pass your base64 encoded authorization private key as `authorizationPrivateKey`
  const signature = generateAuthorizationSignature({
    input,
    authorizationPrivateKey: 'insert-private-key'
  });
  ```

  ```java Java theme={"system"}
  // Build the request, in this case an ethereum personal_sign request
  EthereumPersonalSignRpcInputParams params = EthereumPersonalSignRpcInputParams.builder()
      .message(message)
      .encoding(Encoding.of(EncodingUtf8.UTF8))
      .build();

  EthereumPersonalSignRpcInput request = EthereumPersonalSignRpcInput.builder()
      .method(EthereumPersonalSignRpcInputMethod.PERSONAL_SIGN)
      .params(params)
      .build();


  String signature = privyClient.utils()
    .requestSigner()
    .generateAuthorizationSignature(
        "authorization-key",
        new WalletApiRequestSignatureInput(
            1,
            request,
            HttpMethod.POST,
            "https://api.privy.io/wallets/<insert-wallet-id>/rpc",
            null
        )
    );
  ```

  ```rust Rust theme={"system"}
  use privy_rs::generate_authorization_signatures;

  let ctx = AuthorizationContext::new().push(key);
  let body = serde_json::json!({"test": "data"});

  // Returns a list of signatures given the authorization context
  let sig = generate_authorization_signatures(
        ctx,
        &self.app_id,
        crate::Method::PATCH,
        format!("{}/v1/policies/{}", self.base_url, policy_id.as_str()),
        body,
        "idempotency_key".to_string(),
    )
    .await?;
  ```
</CodeGroup>

This will return a base64-encoded signature over the payload you defined. Include this signature as the `privy-authorization-signature` header when making the request to the Privy API.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n