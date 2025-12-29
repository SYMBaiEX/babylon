# eth_sendTransaction

> Sign and send a transaction using the eth_sendTransaction method.

<RequestExample>
  ```sh cURL theme={"system"}
  curl --request POST \
    --url https://api.privy.io/v1/wallets/{wallet_id}/rpc \
    --header 'Authorization: Basic <encoded-value>' \
    --header 'Content-Type: application/json' \
    --header 'privy-app-id: <privy-app-id>' \
    --data '{
    "method": "eth_sendTransaction",
    "caip2": "eip155:11155111",
    "chain_type": "ethereum",
    "sponsor": true,
    "params": {
      "transaction": {
        "to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "value": "0x2386F26FC10000",
      }
    }
  }'
  ```
</RequestExample>

<ResponseExample>
  ```json 200 theme={"system"}
  {
    "method": "eth_sendTransaction",
    "data": {
      "hash": "0xfc3a736ab2e34e13be2b0b11b39dbc0232a2e755a11aa5a9219890d3b2c6c7d8",
      "caip2": "eip155:11155111",
      "transaction_id": "y90vpg3bnkjxhw541c2zc6a9"
    }
  }
  ```
</ResponseExample>

<Warning>
  A successful response indicates that the transaction has been broadcasted to the network.
  Transactions may get broadcasted but still fail to be confirmed by the network. To handle these
  scenarios, see our guide on [speeding up transactions](/recipes/speeding-up-transactions).
</Warning>

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

<ParamField body="method" type="string" defaultValue="eth_sendTransaction" required>
  Available options: `eth_sendTransaction`
</ParamField>

<ParamField body="caip2" type="string" initialValue="eip155:11155111" required />

<ParamField body="params" type="object" required>
  <Expandable title="child attributes" defaultOpen="true">
    <ParamField body="transaction" type="object" required>
      <Expandable title="child attributes" defaultOpen="true">
        <ParamField body="from" type="string" />

        <ParamField body="to" type="string" />

        <ParamField body="chain_id" type="string" />

        <ParamField body="nonce" type="string" />

        <ParamField body="data" type="string" />

        <ParamField body="value" type="string">
          The value to send in the transaction in wei as a hexadecimal string.
        </ParamField>

        <ParamField body="type" type="number">
          Available options: `0`, `1`, `2`
        </ParamField>

        <ParamField body="gas_limit" type="string" />

        <ParamField body="gas_price" type="string" />
      </Expandable>
    </ParamField>
  </Expandable>
</ParamField>

<ParamField body="sponsor" type="boolean">
  Optional parameter to enable gas sponsorship for this transaction. [Learn
  more.](/wallets/gas-and-asset-management/gas/overview)
</ParamField>

<ParamField body="address" type="string" />

<ParamField body="chain_type" type="string">
  Available options: `ethereum`
</ParamField>

### Returns

<ResponseField name="method" type="enum<string>" required>
  Available options: `eth_sendTransaction`
</ResponseField>

<ResponseField name="data" type="object" required>
  <Expandable title="child attributes" defaultOpen="true">
    <ResponseField name="hash" type="string" required />

    <ResponseField name="caip2" type="string" required />

    <ResponseField name="transaction_id" type="string" />
  </Expandable>
</ResponseField>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n