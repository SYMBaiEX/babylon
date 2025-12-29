# Configure app for native onramp

> Updates the app configuration for the specified onramp provider. This is used to set up the app for fiat onramping and offramping.



## OpenAPI

````yaml post /v1/apps/{app_id}/fiat
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
  /v1/apps/{app_id}/fiat:
    post:
      tags:
        - Fiat
      summary: Configure app for fiat onramping and offramping.
      description: >-
        Updates the app configuration for the specified onramp provider. This is
        used to set up the app for fiat onramping and offramping.
      parameters:
        - schema:
            type: string
            description: >-
              The ID of the app that is being configured for fiat onramping and
              offramping
          required: true
          name: app_id
          in: path
        - schema:
            type: string
            description: ID of your Privy app.
          required: true
          name: privy-app-id
          in: header
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                provider:
                  type: string
                  enum:
                    - bridge
                    - bridge-sandbox
                api_key:
                  type: string
                  minLength: 1
              required:
                - provider
                - api_key
              example:
                provider: bridge-sandbox
                api_key: insert-api-key
      responses:
        '200':
          description: Success message if the app was configured successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                required:
                  - success
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