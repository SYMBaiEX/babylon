# Install a package under a different name

To install an npm package under an alias:

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun add my-custom-name@npm:zod
```

***

The `zod` package can now be imported as `my-custom-name`.

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { z } from "my-custom-name";

z.string();
```

***

See [Docs > Package manager](/pm/cli/install) for complete documentation of Bun's package manager.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
