# Captcha on login

Privy supports adding CAPTCHA to your login flow to prevent botting.

<Tip>
  Enable CAPTCHA in the [Privy
  Dashboard](https://dashboard.privy.io/apps?page=settings\&setting=advanced) before implementing
  this feature.
</Tip>

Once CAPTCHA is enabled, import the `Captcha` component and place it as a peer to your login form: *(When this component mounts, it will execute the invisible Captcha.)*

<Tabs>
  <Tab title="React">
    ```tsx  theme={"system"}
    import {Captcha, useLoginWithEmail} from '@privy-io/react-auth';

    const MyLoginForm = () => {
      const [email, setEmail] = useState('');
      const {sendCode, loginWithCode} = useLoginWithEmail();

      const handleSendCode = async () => {
        try {
          await sendCode(email);
        } catch (err) {
          // Captcha failures due to timeout or otherwise will show up here
          // in addition to possible network errors from the sendCode request
          //
          // The `sendCode` method from `useLoginWithSms` and `initOAuth` method
          // from `useLoginWithOAuth` work exactly the same way.
        }
      };

      return (
        <>
          <input type="text" onChange={(e) => setEmail(e.target.value)} />
          <button onClick={handleSendCode}>Send Code</button>
          <Captcha />
        </>
      );
    };
    ```
  </Tab>
</Tabs>

**That's it! Whenever a user tries to log into your app, Privy will pre-validate the attempt with an invisible captcha.** 🎉

<Info>
  Currently only Cloudflare's [Turnstile](https://www.cloudflare.com/products/turnstile/) is
  supported as a Captcha provider.
</Info>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n