# Delete condition set

> Delete a condition set by condition set ID.



## OpenAPI

````yaml delete /v1/condition_sets/{condition_set_id}
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
  /v1/condition_sets/{condition_set_id}:
    delete:
      tags:
        - Condition sets
      summary: Delete Condition Set
      description: Delete a condition set by condition set ID.
      operationId: delete
      parameters:
        - schema:
            type: string
            minLength: 24
            maxLength: 24
          required: true
          name: condition_set_id
          in: path
        - schema:
            type: string
            description: ID of your Privy app.
          required: true
          name: privy-app-id
          in: header
        - schema:
            type: string
            description: >-
              Request authorization signature. If multiple signatures are
              required, they should be comma separated.
          required: false
          name: privy-authorization-signature
          in: header
      responses:
        '200':
          description: Success response.
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    description: Whether the condition set was deleted successfully.
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