# Hot reload an HTTP server

Bun supports the [`--hot`](/runtime/watch-mode#hot-mode) flag to run a file with hot reloading enabled. When any module or file changes, Bun re-runs the file.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
bun --hot run index.ts
```

***

Bun detects when you are running an HTTP server with `Bun.serve()`. It reloads your fetch handler when source files change, *without* restarting the `bun` process. This makes hot reloads nearly instantaneous.

<Note>
  Note that this doesn't reload the page on your browser.
</Note>

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("Hello world");
  },
});
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
