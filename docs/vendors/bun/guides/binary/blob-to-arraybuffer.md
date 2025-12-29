# Convert a Blob to an ArrayBuffer

The [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) class provides a number of methods for consuming its contents in different formats, including `.arrayBuffer()`.

```ts  theme={"theme":{"light":"github-light","dark":"dracula"}}
const blob = new Blob(["hello world"]);
const buf = await blob.arrayBuffer();
```

***

See [Docs > API > Binary Data](/runtime/binary-data#conversion) for complete documentation on manipulating binary data with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
