# Set per-socket contextual data on a WebSocket

When building a WebSocket server, it's typically necessary to store some identifying information or context associated with each connected client.

With [Bun.serve()](/runtime/http/websockets#contextual-data), this "contextual data" is set when the connection is initially upgraded by passing a `data` parameter in the `server.upgrade()` call.

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.serve({
  fetch(req, server) {
    const success = server.upgrade(req, {
      data: {
        socketId: Math.random(),
      },
    });
    if (success) return undefined;

    // handle HTTP request normally
    // ...
  },
  websocket: {
    // TypeScript: specify the type of ws.data like this
    data: {} as { socketId: number },

    // define websocket handlers
    async message(ws, message) {
      // the contextual data is available as the `data` property
      // on the WebSocket instance
      console.log(`Received ${message} from ${ws.data.socketId}}`);
    },
  },
});
```

***

It's common to read cookies/headers from the incoming request to identify the connecting client.

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
type WebSocketData = {
  createdAt: number;
  token: string;
  userId: string;
};

Bun.serve({
  async fetch(req, server) {
    // use a library to parse cookies
    const cookies = parseCookies(req.headers.get("Cookie"));
    const token = cookies["X-Token"];
    const user = await getUserFromToken(token);

    const upgraded = server.upgrade(req, {
      data: {
        createdAt: Date.now(),
        token: cookies["X-Token"],
        userId: user.id,
      },
    });

    if (upgraded) return undefined;
  },
  websocket: {
    // TypeScript: specify the type of ws.data like this
    data: {} as WebSocketData,

    async message(ws, message) {
      // save the message to a database
      await saveMessageToDatabase({
        message: String(message),
        userId: ws.data.userId,
      });
    },
  },
});
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
