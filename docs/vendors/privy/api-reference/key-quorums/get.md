# Get key quorum

> Get a key quorum by ID.



## OpenAPI

````yaml get /v1/key_quorums/{key_quorum_id}
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
  /v1/key_quorums/{key_quorum_id}:
    get:
      tags:
        - Key quorums
      summary: Get key quorum
      description: Get a key quorum by ID.
      parameters:
        - schema:
            type: string
          required: true
          name: key_quorum_id
          in: path
        - schema:
            type: string
            description: ID of your Privy app.
          required: true
          name: privy-app-id
          in: header
      responses:
        '200':
          description: Object with key quorum data.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/KeyQuorum'
      security:
        - appSecretAuth: []
components:
  schemas:
    KeyQuorum:
      type: object
      properties:
        id:
          type: string
        display_name:
          type: string
          maxLength: 50
        authorization_threshold:
          type: number
          minimum: 1
        authorization_keys:
          type: array
          items:
            type: object
            properties:
              public_key:
                type: string
              display_name:
                type: string
                nullable: true
                maxLength: 50
            required:
              - public_key
              - display_name
        user_ids:
          type: array
          items:
            type: string
      required:
        - id
        - authorization_keys
      example:
        id: tb54eps4z44ed0jepousxi4n
        display_name: Prod key quorum
        authorization_threshold: 1
        authorization_keys:
          - public_key: |-
              MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEx4aoeD72yykviK+f/ckqE2CItVIG
              1rCnvC3/XZ1HgpOcMEMialRmTrqIK4oZlYd1RfxU3za/C9yjhboIuoPD3g==
            display_name: null
          - public_key: |-
              MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAErzZtQr/bMIh3Y8f9ZqseB9i/AfjQ
              hu+agbNqXcJy/TfoNqvc/Y3Mh7gIZ8ZLXQEykycx4mYSpqrxp1lBKqsZDQ==
            display_name: null
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