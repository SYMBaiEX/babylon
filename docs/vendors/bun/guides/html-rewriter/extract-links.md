# Extract links from a webpage using HTMLRewriter

## Extract links from a webpage

Bun's [HTMLRewriter](/runtime/html-rewriter) API can be used to efficiently extract links from HTML content. It works by chaining together CSS selectors to match the elements, text, and attributes you want to process. This is a simple example of how to extract links from a webpage. You can pass `.transform` a `Response`, `Blob`, or `string`.

```ts extract-links.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
async function extractLinks(url: string) {
  const links = new Set<string>();
  const response = await fetch(url);

  const rewriter = new HTMLRewriter().on("a[href]", {
    element(el) {
      const href = el.getAttribute("href");
      if (href) {
        links.add(href);
      }
    },
  });

  // Wait for the response to be processed
  await rewriter.transform(response).blob();
  console.log([...links]); // ["https://bun.com", "/docs", ...]
}

// Extract all links from the Bun website
await extractLinks("https://bun.com");
```

***

## Convert relative URLs to absolute

When scraping websites, you often want to convert relative URLs (like `/docs`) to absolute URLs. Here's how to handle URL resolution:

```ts extract-links.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
async function extractLinksFromURL(url: string) {
  const response = await fetch(url);
  const links = new Set<string>();

  const rewriter = new HTMLRewriter().on("a[href]", {
    element(el) {
      const href = el.getAttribute("href");
      if (href) {
        // Convert relative URLs to absolute // [!code ++]
        try { // [!code ++]
          const absoluteURL = new URL(href, url).href; // [!code ++]
          links.add(absoluteURL);
        } catch { // [!code ++]
          links.add(href); // [!code ++]
        } // [!code ++]
      }
    },
  });

  // Wait for the response to be processed
  await rewriter.transform(response).blob();
  return [...links];
}

const websiteLinks = await extractLinksFromURL("https://example.com");
```

***

See [Docs > API > HTMLRewriter](/runtime/html-rewriter) for complete documentation on HTML transformation with Bun.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
