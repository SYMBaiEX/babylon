# Build an HTTP server using Express and Bun

Express and other major Node.js HTTP libraries should work out of the box. Bun implements the [`node:http`](https://nodejs.org/api/http.html) and [`node:https`](https://nodejs.org/api/https.html) modules that these libraries rely on.

<Note>
  Refer to the [Runtime > Node.js APIs](/runtime/nodejs-compat#node-http) page for more detailed compatibility
  information.
</Note>

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun add express
```

***

To define a simple HTTP route and start a server with Express:

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import express from "express";

const app = express();
const port = 8080;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
```

***

To start the server on `localhost`:

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun server.ts
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
