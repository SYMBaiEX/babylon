# signMessage

> Sign a message with a Solana wallet using the signMessage method.

<RequestExample>
  ```sh cURL theme={"system"}
  curl --request POST \
    --url https://api.privy.io/v1/wallets/{wallet_id}/rpc \
    --header 'Authorization: Basic <encoded-value>' \
    --header 'Content-Type: application/json' \
    --header 'privy-app-id: <privy-app-id>' \
    --data '{
    "method": "signMessage",
    "params": {
      "message": "aGVsbG8sIFByaXZ5IQ=",
      "encoding": "base64"
    }
  }
  '
  ```
</RequestExample>

<ResponseExample>
  ```json 200 theme={"system"}
  {
    "method": "signMessage",
    "data": {
      "signature": "76wpEsq9FS4QOInePQUY3b4GCXdVwLv+nNp4NnI+EPTAPVwvXCjzjUW/gD6Vuh4KaD+7p2X4MaTu6xYu0rMTAA==",
      "encoding": "base64"
    }
  }
  ```
</ResponseExample>

### Headers

<ParamField header="privy-app-id" type="string" required>
  ID of your Privy app.
</ParamField>

<ParamField header="privy-authorization-signature" type="string">
  Request authorization signature. If multiple signatures are required, they should be comma
  separated.
</ParamField>

### Path Parameters

<ParamField path="wallet_id" type="string" required>
  ID of the wallet to get.
</ParamField>

### Body

<ParamField body="method" type="string" defaultValue="signMessage" required>
  Available options: `signMessage`
</ParamField>

<ParamField body="params" type="object" required>
  <Expandable title="child properties">
    <ParamField body="message" type="string">
      Base64 encoded message to sign.
    </ParamField>

    <ParamField body="encoding" type="string">
      Available options: `base64`
    </ParamField>
  </Expandable>
</ParamField>

### Response

<ResponseField name="method" type="enum<string>" required>
  Available options: `signMessage`
</ResponseField>

<ResponseField name="data" type="object" required>
  <Expandable title="child properties">
    <ResponseField name="signature" type="string" required />

    <ResponseField name="encoding" type="enum<string>">
      Available options: `base64`
    </ResponseField>
  </Expandable>
</ResponseField>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n