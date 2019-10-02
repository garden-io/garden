module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "extends": ["react-app"],
  "rules": {
    // FIXME: This is to prevent "Unexpected whitespace before property" false positives.
    // This shouldn't happen in the first place though, not sure what the issue is.
    "no-whitespace-before-property": "off",
    // We use this plugin to import the dashboard tslint config which extends the root level tslint config.
    // Note that tslint rules imported like this will not be autofixable. However, a lot of the
    // rules we need aren't available with @typescript-eslint and we'd rather get a non-fixable
    // lint error as opposed to no error at all.
    "@typescript-eslint/tslint/config": [
      "error",
      {
        "lintFile": "./tslint.json",
      }
    ]
  },
  "globals": {},
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
      "project": "tsconfig.json",
      "sourceType": "module"
  },
  "plugins": [
      "@typescript-eslint",
      "@typescript-eslint/tslint"
  ],
  "settings": {
      "react": {
          "version": "detect"
      }
  }
};
