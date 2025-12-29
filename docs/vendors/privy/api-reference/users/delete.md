# Delete user

> Delete a user by user ID.



## OpenAPI

````yaml delete /v1/users/{user_id}
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
  /v1/users/{user_id}:
    delete:
      tags:
        - Users
      summary: Delete User
      description: Delete a user by user ID.
      parameters:
        - schema:
            type: string
            description: ID of the user.
          required: true
          name: user_id
          in: path
        - schema:
            type: string
            description: ID of your Privy app.
          required: true
          name: privy-app-id
          in: header
      responses:
        '204':
          description: User successfully deleted.
        '404':
          description: User not found.
          content:
            text/html:
              schema:
                type: string
                enum:
                  - User not found
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