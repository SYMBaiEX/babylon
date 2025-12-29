# Policies

Privy’s policy engine gives your application programmable control over how every wallet can be used.

Instead of relying on ad-hoc checks in your code, you can define enforceable rules at the key level that govern what actions a wallet may take.

With policies, you can configure:

* Transfer limits
* Time-bound signers
* Allowlists and denylists of transfer recipients
* Allowlists and denylists of smart contracts and programs
* Allowlists and denylists of networks
* Allowed time window for key export
* Granular constraints around calldata and parameters that can be passed to smart contracts
* Restrictions around signatures needed for transactions, such as EVM typed data (EIP712)

This allows teams to define security, compliance, and behavioral rules that are applied consistently across all wallets in production.

<img src="https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=989f6a61de268b5e232a8b8401d77737" alt="Managing policies in the Privy Dashboard" data-og-width="1192" width="1192" data-og-height="852" height="852" data-path="images/policy-splash.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?w=280&fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=7bf0ceb9a0d4646bb7f0478f6788e68c 280w, https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?w=560&fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=7de15091f47ede52324d91ffe9ae796e 560w, https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?w=840&fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=771e517bf3b5814336a0b8917bdbe51d 840w, https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?w=1100&fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=94d10f809f89f639e2258aec613aca7f 1100w, https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?w=1650&fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=be5ff30c16cc8eed4860351d903e81d1 1650w, https://mintcdn.com/privy-c2af3412/zlmLhiIqRR7ViKN0/images/policy-splash.png?w=2500&fit=max&auto=format&n=zlmLhiIqRR7ViKN0&q=85&s=57d63fe2e9f470ca977ecb1a0634488b 2500w" />

Learn more about policies and how to configure them for your wallets.

<CardGroup cols={2}>
  <Card title="Concepts" href="/controls/policies/overview#concepts" icon="file-contract">
    Learn about policies, rules, and conditions.
  </Card>

  <Card title="Usage" href="/controls/policies/create-a-policy" icon="shield-halved">
    Learn how to create policies and assign them to wallets.
  </Card>
</CardGroup>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n