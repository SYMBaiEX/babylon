# Send an HTTP request using fetch

Bun implements the Web-standard [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API for sending HTTP requests. To send a simple `GET` request to a URL:

```ts fetch.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
const response = await fetch("https://bun.com");
const html = await response.text(); // HTML string
```

***

To send a `POST` request to an API endpoint.

```ts fetch.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
const response = await fetch("https://bun.com/api", {
  method: "POST",
  body: JSON.stringify({ message: "Hello from Bun!" }),
  headers: { "Content-Type": "application/json" },
});

const body = await response.json();
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
