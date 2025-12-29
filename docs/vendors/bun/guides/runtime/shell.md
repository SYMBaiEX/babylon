# Run a Shell Command

Bun Shell is a cross-platform bash-like shell built in to Bun.

It provides a simple way to run shell commands in JavaScript and TypeScript. To get started, import the `$` function from the `bun` package and use it to run shell commands.

```ts foo.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { $ } from "bun";

await $`echo Hello, world!`; // => "Hello, world!"
```

***

The `$` function is a tagged template literal that runs the command and returns a promise that resolves with the command's output.

```ts foo.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { $ } from "bun";

const output = await $`ls -l`.text();
console.log(output);
```

***

To get each line of the output as an array, use the `lines` method.

```ts foo.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { $ } from "bun";

for await (const line of $`ls -l`.lines()) {
  console.log(line);
}
```

***

See [Docs > API > Shell](/runtime/shell) for complete documentation.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
