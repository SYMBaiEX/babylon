# Build an app with Next.js and Bun

[Next.js](https://nextjs.org/) is a React framework for building full-stack web applications. It supports server-side rendering, static site generation, API routes, and more. Bun provides fast package installation and can run Next.js development and production servers.

***

<Steps>
  <Step title="Create a new Next.js app">
    Use the interactive CLI to create a new Next.js app. This will scaffold a new Next.js project and automatically install dependencies.

    ```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
    bun create next-app@latest my-bun-app
    ```
  </Step>

  <Step title="Start the dev server">
    Change to the project directory and run the dev server with Bun.

    ```sh terminal icon="terminal" theme={"theme":{"light":"github-light","dark":"dracula"}}
    cd my-bun-app
    bun --bun run dev
    ```

    This starts the Next.js dev server with Bun's runtime.

    Open [`http://localhost:3000`](http://localhost:3000) with your browser to see the result. Any changes you make to `app/page.tsx` will be hot-reloaded in the browser.
  </Step>

  <Step title="Update scripts in package.json">
    Modify the scripts field in your `package.json` by prefixing the Next.js CLI commands with `bun --bun`. This ensures that Bun executes the Next.js CLI for common tasks like `dev`, `build`, and `start`.

    ```json package.json icon="file-json" theme={"theme":{"light":"github-light","dark":"dracula"}}
    {
      "scripts": {
        "dev": "bun --bun next dev", // [!code ++]
        "build": "bun --bun next build", // [!code ++]
        "start": "bun --bun next start", // [!code ++]
      }
    }
    ```
  </Step>
</Steps>

***

## Hosting

Next.js applications on Bun can be deployed to various platforms.

<Columns cols={3}>
  <Card title="Vercel" href="/guides/deployment/vercel" icon="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=7b490676c38ef9af753b06839da7b0d5" data-og-width="24" width="24" data-og-height="24" height="24" data-path="icons/ecosystem/vercel.svg" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?w=280&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=2f69041eb662751245ec01ba3527ecd8 280w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?w=560&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=609f20ff2ed7594be55b116e4494992e 560w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?w=840&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=820754843eee374bc001239722843b66 840w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?w=1100&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=54214a62c5e8e1759053c6564bdefa00 1100w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?w=1650&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=9ad9d51c642614aeecc862e5eda92769 1650w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/vercel.svg?w=2500&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=31f64e55a394f091b6bd2ea1addcc81d 2500w">
    Deploy on Vercel
  </Card>

  <Card title="Railway" href="/guides/deployment/railway" icon="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=da50a9424b0121975a3bd68e7038425e" data-og-width="24" width="24" data-og-height="24" height="24" data-path="icons/ecosystem/railway.svg" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?w=280&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=5d92b7b3a99cab4be57b47e98defbea7 280w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?w=560&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=4bc63226740ecf04c9b298ee1105c0e1 560w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?w=840&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=527f923f52727abc1ce67908e9c5b2ff 840w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?w=1100&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=bff160d79c9c66e4f7a13fb6939ffceb 1100w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?w=1650&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=eb43bbea39d2196b3fcb47c18e774088 1650w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/railway.svg?w=2500&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=58f7a6355b2dab425837e9db4acf5331 2500w">
    Deploy on Railway
  </Card>

  <Card title="DigitalOcean" href="/guides/deployment/digital-ocean" icon="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=b3f34ba0a9eb2c1968261738759f2542" data-og-width="24" width="24" data-og-height="24" height="24" data-path="icons/ecosystem/digitalocean.svg" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?w=280&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=f5bbb63d61a2efc0069e9c183d3b5e17 280w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?w=560&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=85cb6a584256530a3ee9d24feb64270e 560w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?w=840&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=cd335fd9d8044f4ed397aeae3bb1fbbd 840w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?w=1100&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=7970f7f05261da6e74b82ff083407d12 1100w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?w=1650&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=38ea910de0c72805687a5ce5eed5ec85 1650w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/digitalocean.svg?w=2500&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=791dfae56d923ad3b4138f2af0f166f3 2500w">
    Deploy on DigitalOcean
  </Card>

  <Card title="AWS Lambda" href="/guides/deployment/aws-lambda" icon="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=9733e5ae5faecf5974cbd02661e2b4f2" data-og-width="24" width="24" data-og-height="24" height="24" data-path="icons/ecosystem/aws.svg" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?w=280&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=02e6a70e9cde46ee6585aa3039e69b78 280w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?w=560&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=a1b1e1e231ea958b59d5a34775895d0e 560w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?w=840&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=c8d2666a491fa6b47ea679c6cb65a4e4 840w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?w=1100&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=32bc998e13779a0aa66ce871ffe1e142 1100w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?w=1650&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=058e1867257a251103dc7aa9f18e978f 1650w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/aws.svg?w=2500&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=2c54181e45f6d9f7ce123e806fb82b20 2500w">
    Deploy on AWS Lambda
  </Card>

  <Card title="Google Cloud Run" href="/guides/deployment/google-cloud-run" icon="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=a99e6cb0cfadfeb9ea3b6451de38cfd6" data-og-width="24" width="24" data-og-height="24" height="24" data-path="icons/ecosystem/gcp.svg" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?w=280&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=a6f174aab45cb9ca3897b5778f7633b1 280w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?w=560&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=cfad48954d945d8d67aba73f18d2aa13 560w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?w=840&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=6ffa7b2f6e6c11ac40fc9a5488427774 840w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?w=1100&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=b6dd2138983435a4d422b71b91d0b15f 1100w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?w=1650&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=46ad1c3252441bd6fbc4bfb971d46f51 1650w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/gcp.svg?w=2500&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=79fc209305615cfabb18fbe87e222dfb 2500w">
    Deploy on Google Cloud Run
  </Card>

  <Card title="Render" href="/guides/deployment/render" icon="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=5ac8410728c8e2d747afc287b0b715d9" data-og-width="24" width="24" data-og-height="24" height="24" data-path="icons/ecosystem/render.svg" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?w=280&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=c0beb6dc253fcd42650723cd90bb5bd2 280w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?w=560&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=00c29c4cf4115f8ba0daa533b4848488 560w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?w=840&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=d5db21c928f4cd6b3e80a9ded655ec14 840w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?w=1100&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=3fa7c5864b3dc8d83ff21dded48019f1 1100w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?w=1650&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=368a4e41d28bcf0dd4098084ce7d3d46 1650w, https://mintcdn.com/bun-1dd33a4e/cfVIaCNGtFU88Wgc/icons/ecosystem/render.svg?w=2500&fit=max&auto=format&n=cfVIaCNGtFU88Wgc&q=85&s=1043be998c07fb677d8f8d759e4f893f 2500w">
    Deploy on Render
  </Card>
</Columns>

***

## Templates

<Columns cols={2}>
  <Card title="Bun + Next.js Basic Starter" img="https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=2bc9edb73c9c49d88e8ced9e2158f75a" href="https://github.com/bun-templates/bun-nextjs-basic" arrow="true" cta="Go to template" data-og-width="2212" width="2212" data-og-height="1326" height="1326" data-path="images/templates/bun-nextjs-basic.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?w=280&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=160758dc2a48557d0301e9c2fe829798 280w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?w=560&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=0c9dcae75ad19b90177058dbae5f32af 560w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?w=840&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=258cca0ee15886eca7311900830b6f55 840w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?w=1100&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=cbcaa1b859dee4c29e8f66b312190d95 1100w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?w=1650&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=e3159754a96b2df91abe8031fe28fdf3 1650w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-basic.png?w=2500&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=53b213380cf3557c76f878dea8a0dc4e 2500w">
    A simple App Router starter with Bun, Next.js, and Tailwind CSS.
  </Card>

  <Card title="Todo App with Next.js + Bun" img="https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=e8f398caf487c6b925a53025c42f4dab" href="https://github.com/bun-templates/bun-nextjs-todo" arrow="true" cta="Go to template" data-og-width="2212" width="2212" data-og-height="1326" height="1326" data-path="images/templates/bun-nextjs-todo.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?w=280&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=f6f04b64c40c8daaf8394b3c0882dcb2 280w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?w=560&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=a01481b9ceca0962b512d9b30aed1cef 560w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?w=840&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=72fccde7136063268cdcd85957d58a94 840w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?w=1100&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=b028ce3baf3d39a3b80e6107d4780c36 1100w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?w=1650&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=53e085fca400339cc39e1523b3c11528 1650w, https://mintcdn.com/bun-1dd33a4e/M5IN-LfyV8DoQVZm/images/templates/bun-nextjs-todo.png?w=2500&fit=max&auto=format&n=M5IN-LfyV8DoQVZm&q=85&s=61fa70b5a2ac1b5035888634f053155f 2500w">
    A full-stack todo application built with Bun, Next.js, and PostgreSQL.
  </Card>
</Columns>

***

[→ See Next.js's official documentation](https://nextjs.org/docs) for more information on building and deploying Next.js applications.


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://bun.com/docs/llms.txt
