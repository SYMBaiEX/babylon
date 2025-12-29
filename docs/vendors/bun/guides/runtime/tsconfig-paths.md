# Re-map import paths

Bun reads the `paths` field in your `tsconfig.json` to re-write import paths. This is useful for aliasing package names or avoiding long relative paths.

```json tsconfig.json icon="file-json" theme={"theme":{"light":"github-light","dark":"dracula"}}
{
  "compilerOptions": {
    "paths": {
      "my-custom-name": ["zod"],
      "@components/*": ["./src/components/*"]
    }
  }
}
```

***

With the above `tsconfig.json`, the following imports will be re-written:

```ts tsconfig.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { z } from "my-custom-name"; // imports from "zod"
import { Button } from "@components/Button"; // imports from "./src/components/Button"
```

***

See [Docs > Runtime > TypeScript](/runtime/typescript) for more information on using TypeScript with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
