# Build an HTTP server using Elysia and Bun

[Elysia](https://elysiajs.com) is a Bun-first performance focused web framework that takes full advantage of Bun's HTTP, file system, and hot reloading APIs. Get started with `bun create`.

```bash terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun create elysia myapp
cd myapp
bun run dev
```

***

To define a simple HTTP route and start a server with Elysia:

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { Elysia } from "elysia";

const app = new Elysia().get("/", () => "Hello Elysia").listen(8080);

console.log(`🦊 Elysia is running at on port ${app.server?.port}...`);
```

***

Elysia is a full-featured server framework with Express-like syntax, type inference, middleware, file uploads, and plugins for JWT authentication, tRPC, and more. It's also is one of the [fastest Bun web frameworks](https://github.com/SaltyAom/bun-http-framework-benchmark).

Refer to the Elysia [documentation](https://elysiajs.com/quick-start.html) for more information.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
