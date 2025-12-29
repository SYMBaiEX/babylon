# Read a file to an ArrayBuffer

The `Bun.file()` function accepts a path and returns a `BunFile` instance. The `BunFile` class extends `Blob` and allows you to lazily read the file in a variety of formats. Use `.arrayBuffer()` to read the file as an `ArrayBuffer`.

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
const path = "/path/to/package.json";
const file = Bun.file(path);

const buffer = await file.arrayBuffer();
```

***

The binary content in the `ArrayBuffer` can then be read as a typed array, such as `Int8Array`. For `Uint8Array`, use [`.bytes()`](/guides/read-file/uint8array).

```ts index.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
const buffer = await file.arrayBuffer();
const bytes = new Int8Array(buffer);

bytes[0];
bytes.length;
```

***

Refer to the [Typed arrays](/runtime/binary-data#typedarray) docs for more information on working with typed arrays in Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
