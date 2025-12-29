# Convert a Buffer to a blob

A [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) can be constructed from an array of "chunks", where each chunk is a string, binary data structure (including `Buffer`), or another `Blob`.

```ts  theme={"theme":{"light":"github-light","dark":"dracula"}}
const buf = Buffer.from("hello");
const blob = new Blob([buf]);
```

***

See [Docs > API > Binary Data](/runtime/binary-data#conversion) for complete documentation on manipulating binary data with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
