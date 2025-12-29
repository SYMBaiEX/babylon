# Import a JSON file

Bun natively supports `.json` imports.

```json package.json icon="file-json" theme={"theme":{"light":"github-light","dark":"dracula"}}
{
  "name": "bun",
  "version": "1.0.0",
  "author": {
    "name": "John Dough",
    "email": "john@dough.com"
  }
}
```

***

Import the file like any other source file.

```ts data.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import data from "./package.json";

data.name; // => "bun"
data.version; // => "1.0.0"
data.author.name; // => "John Dough"
```

***

Bun also supports [Import Attributes](https://github.com/tc39/proposal-import-attributes/) and [JSON modules](https://github.com/tc39/proposal-json-modules) syntax.

```ts data.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import data from "./package.json" with { type: "json" };

data.name; // => "bun"
data.version; // => "1.0.0"
data.author.name; // => "John Dough"
```

***

See [Docs > Runtime > TypeScript](/runtime/typescript) for more information on using TypeScript with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
