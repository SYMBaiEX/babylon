# Funding via bank account

<Info>Funding via bank account is currently available server-side in your app.</Info>

The **withdraw from bank account** funding option enables users to convert fiat funds from their bank account into crypto. To facilitate, the user would make a bank transfer (ACH, wire, SEPA) to the onramp provider, who then converts the funds into crypto and deposits it into the user's Privy wallet.

### Process overview

1. The user withdrawing from their bank account **submits KYC information** to the onramp provider, via Privy.
2. The user **initiates an onramp transaction**, which prompts the user to **make a bank transfer** to the onramp provider.
3. Once the fiat funds are received from the user's bank, the provider **converts the funds into crypto and deposits** it into the user's Privy wallet.

### Providers

Below are the providers that currently support bank transfer funding via Privy, with links to a respective step-by-step integration guide and the regions supported. More support and providers coming soon!

* **Bridge** [(integration guide)](/recipes/bridge-onramp): supports ACH, wire, and SEPA funding in the US and Europe.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n