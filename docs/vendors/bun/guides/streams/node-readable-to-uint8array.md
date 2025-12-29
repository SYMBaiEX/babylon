# Convert a Node.js Readable to an Uint8Array

To convert a Node.js `Readable` stream to an `Uint8Array` in Bun, you can create a new `Response` object with the stream as the body, then use `bytes()` to read the stream into an `Uint8Array`.

```ts  theme={"theme":{"light":"github-light","dark":"dracula"}}
import { Readable } from "stream";
const stream = Readable.from(["Hello, ", "world!"]);
const buf = await new Response(stream).bytes();
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
