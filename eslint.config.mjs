import { defineConfig, globalIgnores } from "eslint/config"
import unusedImports from "eslint-plugin-unused-imports"
import mocha from "eslint-plugin-mocha"
import header from "eslint-plugin-header"
import chaiExpect from "eslint-plugin-chai-expect"
import chaiFriendly from "eslint-plugin-chai-friendly"
import path from "node:path"
import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { FlatCompat } from "@eslint/eslintrc"
import stylistic from "@stylistic/eslint-plugin"

/**
 * Set this to avoid error like "Error: Key "rules": Key "header/header": should NOT have more than 0 items."
 * See https://github.com/Stuk/eslint-plugin-header/issues/57#issuecomment-2566346001
 */
header.rules.header.meta.schema = false

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url)
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default defineConfig([
  globalIgnores(["**/*.d.ts*", "garden-sea/tmp/**/*"]),
  {
    extends: compat.extends(
      ".eslintrc.autogenerated.cjs",
      "plugin:@typescript-eslint/recommended",
      "plugin:prettier/recommended",
      "plugin:chai-expect/recommended",
      "plugin:chai-friendly/recommended"
    ),

    plugins: {
      "unused-imports": unusedImports,
      mocha,
      header,
      "chai-expect": chaiExpect,
      "chai-friendly": chaiFriendly,
      "@stylistic": stylistic,
    },

    rules: {
      "@typescript-eslint/no-floating-promises": "error",

      "@typescript-eslint/no-shadow": [
        "warn",
        {
          hoist: "all",
        },
      ],

      "@stylistic/quotes": [
        "error",
        "double",
        {
          avoidEscape: true,
          allowTemplateLiterals: true,
        },
      ],

      // We allow empty functions for cases where callbacks are required but unneeded
      "@typescript-eslint/no-empty-function": "warn",
      // We use `{}` everywhere.
      // To make this safe, we need to actually go through all the cases and see
      // if it's supposed to be a plain object, any object, or really means "anything".
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-restricted-types": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-wrapper-object-types": "warn",
      "arrow-body-style": "off",
      "jsdoc/check-indentation": "off",
      "jsdoc/newline-after-description": "off",
      "no-console": "error",
      "no-unneeded-ternary": "error",
      "@typescript-eslint/no-unused-expressions": "off",

      "chai-friendly/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],

      "max-len": [
        "warn",
        {
          code: 120,
          ignoreStrings: true,
          ignoreComments: true,
          ignoreTemplateLiterals: true,
        },
      ],

      "mocha/no-skipped-tests": "warn",
      "mocha/no-exclusive-tests": "error",
      "unused-imports/no-unused-imports": "error",

      "header/header": [
        2,
        "block",
        [
          "",
          " * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>",
          " *",
          " * This Source Code Form is subject to the terms of the Mozilla Public",
          " * License, v. 2.0. If a copy of the MPL was not distributed with this",
          " * file, You can obtain one at http://mozilla.org/MPL/2.0/.",
          " ",
        ],
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrors: "none", // fixme: fail on unused caught errors, disabled for compatibility
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "warn",

      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn", // TODO: "error"
    },
  },
])
