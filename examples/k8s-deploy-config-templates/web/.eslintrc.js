module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ["plugin:vue/essential", "@vue/airbnb"],
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "error" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",
    "vue/multi-word-component-names": [
      "error",
      {
        ignores: ["Vote"],
      },
    ],
  },
  plugins: ["only-warn"],
  parserOptions: {
    parser: "@babel/eslint-parser",
  },
}
