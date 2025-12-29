# Skip tests with the Bun test runner

To skip a test with the Bun test runner, use the `test.skip` function.

```ts test.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { test } from "bun:test";

test.skip("unimplemented feature", () => {
  expect(Bun.isAwesome()).toBe(true);
});
```

***

Running `bun test` will not execute this test. It will be marked as skipped in the terminal output.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun test
```

```txt  theme={"theme":{"light":"github-light","dark":"dracula"}}
test.test.ts:
✓ add [0.03ms]
✓ multiply [0.02ms]
» unimplemented feature

 2 pass
 1 skip
 0 fail
 2 expect() calls
Ran 3 tests across 1 files. [74.00ms]
```

***

See also:

* [Mark a test as a todo](/guides/test/todo-tests)
* [Docs > Test runner > Writing tests](/test/writing-tests)


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
