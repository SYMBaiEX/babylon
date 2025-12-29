Getting Started / IntroductionYour First RouteHandler and ContextStatus and HeadersValidationLifecycleGuardPluginEncapsulationCookieError HandlingValidation ErrorExtends ContextStandalone SchemaMacroOpenAPIMountUnit TestEnd-to-End Type SafetyWhat&#39;s Next?Documentation# Welcome to Elysia [​](#welcome-to-elysia)

It's great to have you here! This playground is will help you get started with Elysia interactively.

Unlike traditional backend framework, Elysia can also run in a browser as well! Although it doesn't support all features, it's a perfect environment for learning and experimentation.

You can check out the API docs by clicking  on the left sidebar.

## What is Elysia [​](#what-is-elysia)

Elysia is an ergonomic framework for humans.

Ok, seriously, Elysia is a backend TypeScript framework that focuses on developer experience and performance.

What makes Elysia different from other frameworks is that:

- Spectacular performance comparable to Golang.
- Extraordinary TypeScript support with type soundness.
- Built around OpenAPI from the ground up.
- Offers End-to-end Type Safety like tRPC.
- Use Web Standard, allows you to run your code anywhere like Cloudflare Workers, Deno, Bun, Node.js and more.
- It is, of course, designed for humans first.
Although Elysia has some important concept but once get the hang of it, many people find it very enjoyable, and intuative to work with.

## How to use this playground [​](#how-to-use-this-playground)

Playground is divided into 3 sections:

- Documentation and task on the left side (you're reading).
- Code editor in the top right
- Preview, output, and console in the bottom right
## Assignment [​](#assignment)

As for the first assignment, let's modify the code to make the server respond with `"Hello Elysia!"` instead of `"Hello World!"`.

Feels free to look around the code editor and preview section to get familiar with the environment.

Show answerYou can change the response by changing the content inside the `.get` method from `'Hello World!'` to `'Hello Elysia!'`.

typescript```
import { Elysia } from 'elysia'

new Elysia()
	.get('/', 'Hello World!')
	.get('/', 'Hello Elysia!')
	.listen(3000)
```

This would make Elysia response with `"Hello Elysia!"` when you access `/`.
