# Code synchronization example project with Gatsby.js

This project shows how you can configure Garden to perform code synchronization. We'll use [Gatsby.js](https://docs.netlify.com/frameworks/gatsby), a static site generator with built-in live reload support to try out the functionality.

## Usage

Use the `deploy` command with `--sync` enabled:

```sh
garden deploy --sync
```

This tells Garden to reload the files into the container, without re-building and re-deploying.

Now, open `http://gatsby-sync.local.demo.garden/` in your browser, and then try changing some of the website code. For example, open [src/pages/index.js](src/pages/index.js) and change the text in the `h1` tag. You'll notice the page updates immediately in the browser!

## Notes

### Webpack public path

Older versions of Gatsby.js will need to set the `GATSBY_WEBPACK_PUBLICPATH` environment variable to `/`. For example, in the `garden.yml` config:

```
kind: Deploy
description: Minimal Gatsby example
...
services:
  - name: website
    ...
    env:
      GATSBY_WEBPACK_PUBLICPATH: /
    ...
```

For more details see [this issue](https://github.com/gatsbyjs/gatsby/issues/8348).

### Listen to `0.0.0.0`

By default, Gatsby.js only listens to `localhost`. Since we're running it inside a container we'll need to explicitly set the host when executing the `gatsby develop` command. For example, in `package.json`:

```
"scripts": {
  ...
  "dev": "gatsby develop -H 0.0.0.0 -p 8000",
  ...
},
```
