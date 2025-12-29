# Configure allowed OAuth redirect URLs

Similar to allowed domains, you can configure **allowed OAuth redirect URLs** to restrict where users can be redirected after they log in with an external OAuth provider. This is a **security best practice** that prevents users from being redirected to malicious sites with their authentication token. To configure allowed OAuth redirect URLs, navigate to **Configuration > App settings** > **Advanced** on the [dashboard](https://dashboard.privy.io?page=settings\&tab=advanced\&setting=advanced). Add the OAuth providers are allowed to redirect to after authentication.

Please note:

* The URL must be an exact match for the redirect URL; query params and trailing slashes will error.
* The URL must be at a domain listed in allowed domains.
* The protocol (`https`) is required.
* Wildcards (`*`) are not supported.
* If no URLs are listed, users can be redirected to any URL.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n