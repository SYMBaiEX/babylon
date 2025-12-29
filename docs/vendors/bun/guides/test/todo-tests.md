# Mark a test as a "todo" with the Bun test runner

To remind yourself to write a test later, use the `test.todo` function. There's no need to provide a test implementation.

```ts test.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
import { test, expect } from "bun:test";

// write this later
test.todo("unimplemented feature");
```

***

The output of `bun test` indicates how many `todo` tests were encountered.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun test
```

```txt  theme={"theme":{"light":"github-light","dark":"dracula"}}
test.test.ts:
✓ add [0.03ms]
✓ multiply [0.02ms]
✎ unimplemented feature

 2 pass
 1 todo
 0 fail
 2 expect() calls
Ran 3 tests across 1 files. [74.00ms]
```

***

Optionally, you can provide a test implementation.

```ts  theme={"theme":{"light":"github-light","dark":"dracula"}}
import { test, expect } from "bun:test";

test.todo("unimplemented feature", () => {
  expect(Bun.isAwesome()).toBe(true);
});
```

***

If an implementation is provided, it will not be run unless the `--todo` flag is passed. If the `--todo` flag is passed, the test will be executed and *expected to fail* by test runner! If a todo test passes, the `bun test` run will return a non-zero exit code to signal the failure.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun test --todo
```

```txt  theme={"theme":{"light":"github-light","dark":"dracula"}}
my.test.ts:
✗ unimplemented feature
  ^ this test is marked as todo but passes. Remove `.todo` or check that test is correct.

 0 pass
 1 fail
 1 expect() calls
$ echo $?
1 # this is the exit code of the previous command
```

***

See also:

* [Skip a test](/guides/test/skip-tests)
* [Docs > Test runner > Writing tests](/test/writing-tests)


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
