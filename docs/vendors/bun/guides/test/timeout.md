# Set a per-test timeout with the Bun test runner

Use the `--timeout` flag to set a timeout for each test in milliseconds. If any test exceeds this timeout, it will be marked as failed.

The default timeout is `5000` (5 seconds).

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun test --timeout 3000 # 3 seconds
```

***

See [Docs > Test runner](/test) for complete documentation of `bun test`.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
