---
url: 'https://elysiajs.com/eden/treaty/websocket.md'
---

# WebSocket

Eden Treaty supports WebSocket using `subscribe` method.

```typescript twoslash
import { Elysia, t } from "elysia";
import { treaty } from "@elysiajs/eden";

const app = new Elysia()
  .ws("/chat", {
    body: t.String(),
    response: t.String(),
    message(ws, message) {
      ws.send(message);
    },
  })
  .listen(3000);

const api = treaty<typeof app>("localhost:3000");

const chat = api.chat.subscribe();

chat.subscribe((message) => {
  console.log("got", message);
});

chat.on("open", () => {
  chat.send("hello from client");
});
```

**.subscribe** accepts the same parameter as `get` and `head`.

## Response

**Eden.subscribe** returns **EdenWS** which extends the [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket) results in identical syntax.

If more control is need, **EdenWebSocket.raw** can be accessed to interact with the native WebSocket API.
