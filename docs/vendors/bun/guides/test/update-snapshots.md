# Update snapshots in `bun test`

Bun's test runner supports Jest-style snapshot testing via `.toMatchSnapshot()`.

```ts snap.test.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { test, expect } from "bun:test";

test("snapshot", () => {
  expect({ foo: "bar" }).toMatchSnapshot();
});
```

***

The first time this test is executed, Bun will write a snapshot file to disk in a directory called `__snapshots__` that lives alongside the test file.

```txt File Tree icon="folder-tree" theme={"theme":{"light":"github-light","dark":"dracula"}}
test
├── __snapshots__
│   └── snap.test.ts.snap
└── snap.test.ts
```

***

To regenerate snapshots, use the `--update-snapshots` flag.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun test --update-snapshots
```

```txt  theme={"theme":{"light":"github-light","dark":"dracula"}}
test/snap.test.ts:
✓ snapshot [0.86ms]

 1 pass
 0 fail
 snapshots: +1 added # the snapshot was regenerated
 1 expect() calls
Ran 1 tests across 1 files. [102.00ms]
```

***

See [Docs > Test Runner > Snapshots](/test/snapshots) for complete documentation on snapshots with the Bun test runner.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
