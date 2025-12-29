# Set environment variables

The current environment variables can be accessed via `process.env` or `Bun.env`.

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.env.API_TOKEN; // => "secret"
process.env.API_TOKEN; // => "secret"
```

***

Set these variables in a `.env` file.

Bun reads the following files automatically (listed in order of increasing precedence).

* `.env`
* `.env.production`, `.env.development`, `.env.test` (depending on value of `NODE_ENV`)
* `.env.local` (not loaded when `NODE_ENV=test`)

```ini .env icon="settings" theme={"theme":{"light":"github-light","dark":"dracula"}}
FOO=hello
BAR=world
```

***

Variables can also be set via the command line.

<CodeGroup>
  ```sh Linux/macOS icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
  FOO=helloworld bun run dev
  ```

  ```sh Windows icon="windows" theme={"theme":{"light":"github-light","dark":"dracula"}}
  # Using CMD
  set FOO=helloworld && bun run dev

  # Using PowerShell
  $env:FOO="helloworld"; bun run dev
  ```
</CodeGroup>

***

See [Docs > Runtime > Environment variables](/runtime/environment-variables) for more information on using environment variables with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
