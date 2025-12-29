# Get wallets

> Get all wallets in your app.



## OpenAPI

````yaml get /v1/wallets
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
  /v1/wallets:
    get:
      tags:
        - Wallets
      summary: Get all wallets
      description: Get all wallets in your app.
      parameters:
        - schema:
            type: string
            minLength: 1
          required: false
          name: cursor
          in: query
        - schema:
            type: number
            nullable: true
            maximum: 100
          required: false
          name: limit
          in: query
        - schema:
            $ref: '#/components/schemas/WalletChainType'
          required: false
          name: chain_type
          in: query
        - schema:
            type: string
          required: false
          name: user_id
          in: query
        - schema:
            type: string
            description: ID of your Privy app.
          required: true
          name: privy-app-id
          in: header
      responses:
        '200':
          description: Object with wallet data.
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Wallet'
                  next_cursor:
                    type: string
                required:
                  - data
      security:
        - appSecretAuth: []
components:
  schemas:
    WalletChainType:
      type: string
      enum:
        - ethereum
        - solana
        - cosmos
        - stellar
        - sui
        - aptos
        - movement
        - tron
        - bitcoin-segwit
        - near
        - ton
        - starknet
        - spark
      description: The wallet chain types.
      title: WalletChainType
      x-stainless-model: wallets.wallet_chain_type
    Wallet:
      type: object
      properties:
        id:
          type: string
          description: >-
            Unique ID of the wallet. This will be the primary identifier when
            using the wallet in the future.
        address:
          type: string
          description: Address of the wallet.
        public_key:
          type: string
          description: >-
            The compressed, raw public key for the wallet along the chain
            cryptographic curve.
        created_at:
          type: number
          description: Unix timestamp of when the wallet was created in milliseconds.
        chain_type:
          $ref: '#/components/schemas/WalletChainType'
        policy_ids:
          type: array
          items:
            type: string
          description: List of policy IDs for policies that are enforced on the wallet.
        owner_id:
          type: string
          nullable: true
          description: The key quorum ID of the owner of the wallet.
        additional_signers:
          $ref: '#/components/schemas/WalletAdditionalSigner'
        exported_at:
          type: number
          nullable: true
          description: >-
            Unix timestamp of when the wallet was exported in milliseconds, if
            the wallet was exported.
        imported_at:
          type: number
          nullable: true
          description: >-
            Unix timestamp of when the wallet was imported in milliseconds, if
            the wallet was imported.
      required:
        - id
        - address
        - created_at
        - chain_type
        - policy_ids
        - owner_id
        - additional_signers
        - exported_at
        - imported_at
      example:
        id: id2tptkqrxd39qo9j423etij
        address: '0xF1DBff66C993EE895C8cb176c30b07A559d76496'
        chain_type: ethereum
        policy_ids: []
        additional_signers: []
        owner_id: rkiz0ivz254drv1xw982v3jq
        created_at: 1741834854578
        exported_at: null
        imported_at: null
    WalletAdditionalSigner:
      type: array
      items:
        type: object
        properties:
          signer_id:
            type: string
          override_policy_ids:
            type: array
            items:
              type: string
            description: >-
              The array of policy IDs that will be applied to wallet requests.
              If specified, this will override the base policy IDs set on the
              wallet.
        required:
          - signer_id
      description: Additional signers for the wallet.
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