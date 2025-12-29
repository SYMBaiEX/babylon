# Common HTTP server usage

This starts an HTTP server listening on port `3000`. It demonstrates basic routing with a number of common responses and also handles POST data from standard forms or as JSON.

See [`Bun.serve`](/runtime/http/server) for details.

```ts server.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
const server = Bun.serve({
  async fetch(req) {
    const path = new URL(req.url).pathname;

    // respond with text/html
    if (path === "/") return new Response("Welcome to Bun!");

    // redirect
    if (path === "/abc") return Response.redirect("/source", 301);

    // send back a file (in this case, *this* file)
    if (path === "/source") return new Response(Bun.file(import.meta.path));

    // respond with JSON
    if (path === "/api") return Response.json({ some: "buns", for: "you" });

    // receive JSON data to a POST request
    if (req.method === "POST" && path === "/api/post") {
      const data = await req.json();
      console.log("Received JSON:", data);
      return Response.json({ success: true, data });
    }

    // receive POST data from a form
    if (req.method === "POST" && path === "/form") {
      const data = await req.formData();
      console.log(data.get("someField"));
      return new Response("Success");
    }

    // 404s
    return new Response("Page not found", { status: 404 });
  },
});

console.log(`Listening on ${server.url}`);
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
