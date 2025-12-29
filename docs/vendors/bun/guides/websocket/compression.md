# Enable compression for WebSocket messages

Per-message compression can be enabled with the `perMessageDeflate` parameter. When set, all messages will be compressed using the [permessage-deflate](https://tools.ietf.org/html/rfc7692) WebSocket extension.

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.serve({
  // ...
  websocket: {
    // enable compression
    perMessageDeflate: true,
  },
});
```

***

To enable compression for individual messages, pass `true` as the second parameter to `ws.send()`.

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.serve({
  // ...
  websocket: {
    async message(ws, message) {
      // send a compressed message
      ws.send(message, true);
    },
  },
});
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
