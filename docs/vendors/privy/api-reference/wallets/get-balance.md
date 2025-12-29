# Get balance

> Get the balance of a wallet by wallet ID.



## OpenAPI

````yaml get /v1/wallets/{wallet_id}/balance
openapi: 3.0.0
info:
  version: 0.0.1
  title: Privy API
  contact:
    email: support@privy.io
servers:
  - url: https://api.privy.io
security: []
tags:
  - name: Wallets
    description: Operations related to wallets
  - name: Policies
    description: Operations related to policies
  - name: Condition Sets
    description: Operations related to condition sets
  - name: Transactions
    description: Operations related to transactions
  - name: Key quorums
    description: Operations related to key quorums
  - name: Users
    description: Operations related to users
  - name: User signers
    description: Operations related to user signers
  - name: Fiat
    description: Operations related to fiat onramping and offramping
  - name: Kraken Embed
    description: >-
      Operations for Kraken Embed integration, including quotes, trades, user
      management, and portfolio operations
paths:
  /v1/wallets/{wallet_id}/balance:
    get:
      tags:
        - Wallets
      summary: Get balance
      description: Get the balance of a wallet by wallet ID.
      parameters:
        - schema:
            type: string
            description: ID of the wallet.
          required: true
          name: wallet_id
          in: path
        - schema:
            anyOf:
              - type: string
                enum:
                  - usdc
                  - eth
                  - pol
                  - usdt
                  - eurc
                  - sol
                  - usdc
                  - eurc
              - type: array
                items:
                  type: string
                  enum:
                    - usdc
                    - eth
                    - pol
                    - usdt
                    - eurc
                    - sol
                    - usdc
                    - eurc
                maxItems: 10
          required: true
          name: asset
          in: query
        - schema:
            anyOf:
              - type: string
                enum:
                  - ethereum
                  - arbitrum
                  - base
                  - linea
                  - optimism
                  - polygon
                  - solana
                  - zksync_era
                  - sepolia
                  - arbitrum_sepolia
                  - base_sepolia
                  - linea_testnet
                  - optimism_sepolia
                  - polygon_amoy
                  - solana_devnet
                  - solana_testnet
              - type: array
                items:
                  type: string
                  enum:
                    - ethereum
                    - arbitrum
                    - base
                    - linea
                    - optimism
                    - polygon
                    - solana
                    - zksync_era
                    - sepolia
                    - arbitrum_sepolia
                    - base_sepolia
                    - linea_testnet
                    - optimism_sepolia
                    - polygon_amoy
                    - solana_devnet
                    - solana_testnet
                maxItems: 10
          required: true
          name: chain
          in: query
        - schema:
            type: string
            enum:
              - usd
          required: false
          name: include_currency
          in: query
        - schema:
            type: string
            description: ID of your Privy app.
          required: true
          name: privy-app-id
          in: header
      responses:
        '200':
          description: Latest wallet balance.
          content:
            application/json:
              schema:
                type: object
                properties:
                  balances:
                    type: array
                    items:
                      type: object
                      properties:
                        chain:
                          type: string
                          enum:
                            - ethereum
                            - arbitrum
                            - base
                            - linea
                            - optimism
                            - polygon
                            - solana
                            - zksync_era
                            - sepolia
                            - arbitrum_sepolia
                            - base_sepolia
                            - linea_testnet
                            - optimism_sepolia
                            - polygon_amoy
                            - solana_devnet
                            - solana_testnet
                        asset:
                          type: string
                          enum:
                            - usdc
                            - eth
                            - pol
                            - usdt
                            - eurc
                            - sol
                            - usdc
                            - eurc
                        raw_value:
                          type: string
                        raw_value_decimals:
                          type: number
                        display_values:
                          type: object
                          additionalProperties:
                            type: string
                      required:
                        - chain
                        - asset
                        - raw_value
                        - raw_value_decimals
                        - display_values
                required:
                  - balances
                example:
                  balances:
                    - chain: base
                      asset: eth
                      raw_value: '1000000000000000000'
                      raw_value_decimals: 18
                      display_values:
                        eth: '0.001'
                        usd: '2.56'
      security:
        - appSecretAuth: []
components:
  securitySchemes:
    appSecretAuth:
      type: http
      scheme: basic
      description: >-
        Basic Auth header with your app ID as the username and your app secret
        as the password.

````

---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n