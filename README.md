# nanto88.github.io

Personal technical blog, built with [Astro](https://astro.build).

## Writing a post

Add a Markdown (or MDX) file to `src/content/blog/`:

```yaml
---
title: "Post title"
description: "One-line summary."
pubDate: 2026-08-10
tags: [backend, golang]
category: backend
draft: false
---
```

Then:

```sh
git add .
git commit -m "new post"
git push
```

GitHub Actions builds and deploys automatically.

## Commands

| Command         | Action                                      |
| ---------------- | -------------------------------------------- |
| `npm install`     | Install dependencies                         |
| `npm run dev`     | Start local dev server at `localhost:4321`   |
| `npm run check`   | Type-check content and components            |
| `npm run build`   | Build production site to `./dist/`           |
| `npm run preview` | Preview the production build locally         |
