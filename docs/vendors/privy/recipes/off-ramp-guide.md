# Off-ramping with Privy

Privy makes it easy to let your users off-ramp crypto assets to fiat by integrating with third-party providers. Whether you want to offer a seamless widget experience or implement a pure API solution, Privy's flexible integration options ensure your users can convert their crypto to cash with minimal friction.

These integrations create a seamless user experience, allowing your users to cash out their crypto assets without leaving your application ecosystem.

## Off-ramping with Privy

<Steps>
  <Step title="User has assets in their wallet">
    Assets are stored in the user's Privy wallet and can be off-ramped
  </Step>

  <Step title="Integration and setup">
    Add your chosen off-ramp provider's SDK to your application, configure it with your API keys,
    and allow users to trigger withdrawals via the provider's interface
  </Step>

  <Step title="User verification">
    User completes the provider's KYC process (only required once) and connects their bank account
    through the provider's secure interface
  </Step>

  <Step title="Transaction and payout">
    Privy handles signing and sending the transaction to the provider's address, then the provider
    processes the transaction and transfers funds to user's bank account
  </Step>
</Steps>

Privy makes it easy to off ramp assets with a number of third party providers. Select which provider you'd like to use and follow the instructions to integrate.

| Provider     | Off-Ramp Documentation                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Coinflow     | [Coinflow off-ramp docs](https://docs.coinflow.cash/docs/how-withdraws-work)                         |
| MoonPay      | [MoonPay off-ramp docs](https://dev.moonpay.com/v1.0/docs/off-ramp-overview)                         |
| Ramp Network | [Ramp Network off-ramp docs](https://docs.ramp.network/off-ramp)                                     |
| Coinbase     | [Coinbase off-ramp docs](https://docs.cdp.coinbase.com/onramp/docs/api-offramp-overview)             |
| Hifi         | [Hifi off-ramp docs](https://docs.hifibridge.com/docs/api-offramp)                                   |
| Bridge       | [Bridge off-ramp docs](https://apidocs.bridge.xyz/get-started/guides/move-money/offramp_liquidation) |

## Sending assets from a Privy wallet

To send assets to an off ramp provider, you can use any of Privy's SDKS to send a Transaction either on Ethereum or Solana. Learn more about sending transactions with Privy below:

* [Ethereum](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)
* [Solana](https://docs.privy.io/wallets/using-wallets/solana/send-a-transaction)


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n