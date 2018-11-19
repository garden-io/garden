<p align="center">
  <a href="https://next.gatsbyjs.org">
    <img alt="Gatsby" src="https://www.gatsbyjs.org/monogram.svg" width="60" />
  </a>
</p>

# Hot reload example project with Gatsby.js

This project shows how you can configure Garden to use **hot reloading**. We'll use [Gatsby.js](https://www.gatsbyjs.org/), a static site generator with built-in hot reload support to try out the functionality.

## Usage

Use the `dev` command but with the `--hot-reload` flag:

```sh
garden dev --hot-reload=website
```

This tells Garden to reload the files into the container, without re-building and re-deploying.

Now, open `http://gatsby-hot-reload.local.app.garden/` in your browser, and then try changing some of the website code. For example, open `src/pages/index.js` and change the text in the `h1` tag. You'll notice the page updates immediately in the browser!

## Notes

### Webpack public path

Older versions of Gatsby.js will need to set the `GATSBY_WEBPACK_PUBLICPATH` environment variable to `/`. For example, in the `garden.yml` config:
```
module:
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
