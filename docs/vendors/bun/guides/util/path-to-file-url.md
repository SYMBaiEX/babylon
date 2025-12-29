# Convert an absolute path to a file URL

Use `Bun.pathToFileURL()` to convert an absolute path to a `file://` URL.

```ts  theme={"theme":{"light":"github-light","dark":"dracula"}}
Bun.pathToFileURL("/path/to/file.txt");
// => "file:///path/to/file.txt"
```

***

See [Docs > API > Utils](/runtime/utils) for more useful utilities.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
