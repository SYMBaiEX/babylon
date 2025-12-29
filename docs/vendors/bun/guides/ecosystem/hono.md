# Build an HTTP server using Hono and Bun

[Hono](https://github.com/honojs/hono) is a lightweight ultrafast web framework designed for the edge.

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { Hono } from "hono";
const app = new Hono();

app.get("/", c => c.text("Hono!"));

export default app;
```

***

Use `create-hono` to get started with one of Hono's project templates. Select `bun` when prompted for a template.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun create hono myapp
```

```txt  theme={"theme":{"light":"github-light","dark":"dracula"}}
✔ Which template do you want to use? › bun
cloned honojs/starter#main to /path/to/myapp
✔ Copied project files
```

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
cd myapp
bun install
```

***

Then start the dev server and visit [localhost:3000](http://localhost:3000).

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun run dev
```

***

Refer to Hono's guide on [getting started with Bun](https://hono.dev/getting-started/bun) for more information.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
