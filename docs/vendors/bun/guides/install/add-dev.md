# Add a development dependency

To add an npm package as a development dependency, use `bun add --development`.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun add zod --dev
bun add zod -d # shorthand
```

***

This will add the package to `devDependencies` in `package.json`.

```json  theme={"theme":{"light":"github-light","dark":"dracula"}}
{
  "devDependencies": {
    "zod": "^3.0.0" // [!code ++]
  }
}
```

***

See [Docs > Package manager](/pm/cli/install) for complete documentation of Bun's package manager.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
