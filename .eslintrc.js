/*
👋 Hi! This file was autogenerated by tslint-to-eslint-config.
https://github.com/typescript-eslint/tslint-to-eslint-config

It represents the closest reasonable ESLint configuration to this
project's original TSLint configuration.

We recommend eventually switching this configuration to extend from
the recommended rulesets in typescript-eslint. 
https://github.com/typescript-eslint/tslint-to-eslint-config/blob/master/docs/FAQs.md

Happy linting! 💖
*/
module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  extends: ["prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    sourceType: "module",
  },
  plugins: ["eslint-plugin-react", "eslint-plugin-jsdoc", "eslint-plugin-no-null", "@typescript-eslint"],
  root: true,
  rules: {
    "@babel/object-curly-spacing": "off",
    "@babel/semi": "off",
    "@typescript-eslint/brace-style": "off",
    "@typescript-eslint/comma-dangle": "off",
    "@typescript-eslint/comma-spacing": "off",
    "@typescript-eslint/func-call-spacing": "off",
    "@typescript-eslint/indent": ["off", 2],
    "@typescript-eslint/keyword-spacing": "off",
    "@typescript-eslint/member-delimiter-style": [
      "error",
      {
        multiline: {
          delimiter: "none",
          requireLast: true,
        },
        singleline: {
          delimiter: "semi",
          requireLast: false,
        },
      },
    ],
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "variable",
        format: ["camelCase", "UPPER_CASE", "PascalCase"],
        leadingUnderscore: "allow",
        trailingUnderscore: "forbid",
      },
    ],
    "@typescript-eslint/no-extra-parens": "off",
    "@typescript-eslint/no-extra-semi": "off",
    "@typescript-eslint/no-floating-promises": "warn",
    "@typescript-eslint/no-shadow": [
      "warn",
      {
        hoist: "all",
      },
    ],
    "@typescript-eslint/object-curly-spacing": "off",
    "@typescript-eslint/quotes": [
      "error",
      "double",
      {
        avoidEscape: true,
        allowTemplateLiterals: true,
      },
    ],
    "@typescript-eslint/semi": ["error", "never"],
    "@typescript-eslint/space-before-blocks": "off",
    "@typescript-eslint/space-before-function-paren": "off",
    "@typescript-eslint/space-infix-ops": "off",
    "@typescript-eslint/type-annotation-spacing": "off",
    "array-bracket-newline": "off",
    "array-bracket-spacing": "off",
    "array-element-newline": "off",
    "arrow-body-style": "off",
    "arrow-parens": ["off", "always"],
    "arrow-spacing": "off",
    "babel/object-curly-spacing": "off",
    "babel/quotes": "off",
    "babel/semi": "off",
    "block-spacing": "off",
    "brace-style": ["off", "off"],
    "comma-dangle": "off",
    "comma-spacing": "off",
    "comma-style": "off",
    "computed-property-spacing": "off",
    "curly": "error",
    "dot-location": "off",
    "eol-last": "error",
    "eqeqeq": ["error", "always"],
    "flowtype/boolean-style": "off",
    "flowtype/delimiter-dangle": "off",
    "flowtype/generic-spacing": "off",
    "flowtype/object-type-curly-spacing": "off",
    "flowtype/object-type-delimiter": "off",
    "flowtype/quotes": "off",
    "flowtype/semi": "off",
    "flowtype/space-after-type-colon": "off",
    "flowtype/space-before-generic-bracket": "off",
    "flowtype/space-before-type-colon": "off",
    "flowtype/union-intersection-spacing": "off",
    "func-call-spacing": "off",
    "function-call-argument-newline": "off",
    "function-paren-newline": "off",
    "generator-star": "off",
    "generator-star-spacing": "off",
    "id-denylist": "error",
    "id-match": "error",
    "implicit-arrow-linebreak": "off",
    "indent": "off",
    "indent-legacy": "off",
    "jsdoc/check-alignment": "error",
    "jsdoc/check-indentation": "error",
    "jsdoc/newline-after-description": "error",
    "jsx-quotes": "off",
    "key-spacing": "off",
    "keyword-spacing": "off",
    "linebreak-style": "off",
    "lines-around-comment": "off",
    "max-len": [
      "warn",
      {
        code: 120,
        ignoreStrings: true,
        ignoreComments: true,
        ignoreTemplateLiterals: true,
      },
    ],
    "multiline-ternary": "off",
    "new-parens": "off",
    "newline-per-chained-call": "off",
    "no-arrow-condition": "off",
    "no-comma-dangle": "off",
    "no-confusing-arrow": "off",
    "no-console": [
      "error",
      {
        allow: [
          "warn",
          "dir",
          "time",
          "timeEnd",
          "timeLog",
          "trace",
          "assert",
          "clear",
          "count",
          "countReset",
          "group",
          "groupEnd",
          "table",
          "debug",
          "info",
          "dirxml",
          "groupCollapsed",
          "Console",
          "profile",
          "profileEnd",
          "timeStamp",
          "context",
        ],
      },
    ],
    "no-debugger": "error",
    "no-eval": "error",
    "no-extra-parens": "off",
    "no-extra-semi": "off",
    "no-fallthrough": "error",
    "no-floating-decimal": "off",
    "no-invalid-this": "error",
    "no-irregular-whitespace": "off",
    "no-mixed-operators": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-multi-spaces": "off",
    "no-multiple-empty-lines": "error",
    "no-null/no-null": "off",
    "no-reserved-keys": "off",
    "no-shadow": "off",
    "no-space-before-semi": "off",
    "no-spaced-func": "off",
    "no-tabs": "off",
    "no-trailing-spaces": "error",
    "no-underscore-dangle": "off",
    "no-unexpected-multiline": "off",
    "no-var": "error",
    "no-whitespace-before-property": "off",
    "no-wrap-func": "off",
    "nonblock-statement-body-position": "off",
    "object-curly-newline": "off",
    "object-curly-spacing": "off",
    "object-property-newline": "off",
    "object-shorthand": "error",
    "one-var": ["error", "never"],
    "one-var-declaration-per-line": "off",
    "operator-linebreak": "off",
    "padded-blocks": [
      "off",
      {
        blocks: "never",
      },
      {
        allowSingleLineBlocks: true,
      },
    ],
    "prefer-template": "off",
    "quote-props": ["error", "consistent-as-needed"],
    "quotes": "off",
    "radix": "error",
    "react/jsx-child-element-spacing": "off",
    "react/jsx-closing-bracket-location": "off",
    "react/jsx-closing-tag-location": "off",
    "react/jsx-curly-newline": "off",
    "react/jsx-curly-spacing": "off",
    "react/jsx-equals-spacing": "off",
    "react/jsx-first-prop-new-line": "off",
    "react/jsx-indent": "off",
    "react/jsx-indent-props": "off",
    "react/jsx-max-props-per-line": "off",
    "react/jsx-newline": "off",
    "react/jsx-one-expression-per-line": "off",
    "react/jsx-props-no-multi-spaces": "off",
    "react/jsx-space-before-closing": "off",
    "react/jsx-tag-spacing": [
      "off",
      {
        afterOpening: "allow",
        closingSlash: "allow",
      },
    ],
    "react/jsx-wrap-multilines": "off",
    "rest-spread-spacing": "off",
    "semi": "off",
    "semi-spacing": "off",
    "semi-style": "off",
    "space-after-function-name": "off",
    "space-after-keywords": "off",
    "space-before-blocks": "off",
    "space-before-function-paren": "off",
    "space-before-function-parentheses": "off",
    "space-before-keywords": "off",
    "space-in-brackets": "off",
    "space-in-parens": ["off", "never"],
    "space-infix-ops": "off",
    "space-return-throw-case": "off",
    "space-unary-ops": "off",
    "space-unary-word-ops": "off",
    "standard/array-bracket-even-spacing": "off",
    "standard/computed-property-even-spacing": "off",
    "standard/object-curly-even-spacing": "off",
    "switch-colon-spacing": "off",
    "template-curly-spacing": "off",
    "template-tag-spacing": "off",
    "unicode-bom": "off",
    "unicorn/empty-brace-spaces": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/number-literal-case": "off",
    "wrap-iife": "off",
    "wrap-regex": "off",
    "yield-star-spacing": "off",
  },
}
