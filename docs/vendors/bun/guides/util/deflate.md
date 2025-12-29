# Compress and decompress data with DEFLATE

Use `Bun.deflateSync()` to compress a `Uint8Array` with DEFLATE.

```ts  theme={"theme":{"light":"github-light","dark":"dracula"}}
const data = Buffer.from("Hello, world!");
const compressed = Bun.deflateSync("Hello, world!");
// => Uint8Array

const decompressed = Bun.inflateSync(compressed);
// => Uint8Array
```

***

See [Docs > API > Utils](/runtime/utils) for more useful utilities.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
