# Read environment variables

The current environment variables can be accessed via `process.env`.

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
process.env.API_TOKEN; // => "secret"
```

***

Bun also exposes these variables via `Bun.env`, which is a simple alias of `process.env`.

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.env.API_TOKEN; // => "secret"
```

***

To print all currently-set environment variables to the command line, run `bun --print process.env`. This is useful for debugging.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun --print process.env
```

```txt  theme={"theme":{"light":"github-light","dark":"dracula"}}
BAZ=stuff
FOOBAR=aaaaaa
<lots more lines>
```

***

See [Docs > Runtime > Environment variables](/runtime/environment-variables) for more information on using environment variables with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
