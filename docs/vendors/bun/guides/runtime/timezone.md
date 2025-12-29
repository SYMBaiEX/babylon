# Set a time zone in Bun

Bun supports programmatically setting a default time zone for the lifetime of the `bun` process. To do set, set the value of the `TZ` environment variable to a [valid timezone identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

<Note>
  When running a file with `bun`, the timezone defaults to your system's configured local time zone.

  When running tests with `bun test`, the timezone is set to `UTC` to make tests more deterministic.
</Note>

```ts process.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
process.env.TZ = "America/New_York";
```

***

Alternatively, this can be set from the command line when running a Bun command.

```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
TZ=America/New_York bun run dev
```

***

Once `TZ` is set, any `Date` instances will have that time zone. By default all dates use your system's configured time zone.

```ts process.ts icon="https://mintcdn.com/bun-1dd33a4e/Hq64iapoQXHbYMEN/icons/typescript.svg?fit=max&auto=format&n=Hq64iapoQXHbYMEN&q=85&s=c6cceedec8f82d2cc803d7c6ec82b240" theme={"theme":{"light":"github-light","dark":"dracula"}}
new Date().getHours(); // => 18

process.env.TZ = "America/New_York";

new Date().getHours(); // => 21
```


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
