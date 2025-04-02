/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { nodeResolve } from "@rollup/plugin-node-resolve"
import commonjs from "@rollup/plugin-commonjs"
import json from "@rollup/plugin-json"
import replace from "@rollup/plugin-replace";
import url from "@rollup/plugin-url";

export default {
  logLevel: "debug",
  input: "garden-sea/tmp/source/cli/bin/garden.js",
  external: [
    /.*\.node$/g,
  ],
  output: {
    dir: "garden-sea/tmp/rollup/",
    format: "esm",
    name: "MyModule",
    // Make sure we can still dynamically import certain heavy dependencies
    // and they don't get immediately hoisted or inlined
    inlineDynamicImports: false,
    hoistTransitiveImports: false,
    entryFileNames: "[name].mjs",
    chunkFileNames: "[name]-[hash].mjs",
  },
  plugins: [
    // Rewrite require calls to use the global require to import native modules.
    {
      name: "rewrite-native-require",
      generateBundle: (_options, bundle) => {
        for (const file of Object.values(bundle)) {
          if (file.type === "chunk") {
            file.code = file.code.replace(/require\(.+\/([a-z]+\.node)['"]\)/g, "require(process.env.GARDEN_SEA_EXTRACTED_ROOT + '/native/$1')")
          }
        }
      }
    },
    // Hack: Replace version in `getPackageVersion()` function, because the `json()` plugin below somehow loads the wrong package.json file.
    replace({
      include: [/core.*\.js/],
      values: {
        "const { version } = corePackageJson": `const version = ${JSON.stringify(process.env.GARDEN_CORE_VERSION || "0.0.0-dev")}`,
      },
      delimiters: ["", ""],
    }),
    // we import the package.json file for version number detection, but for some reasons rollup reads the package.json files in ./ instead of in ./garden-sea/tmp/source/
    // That's why we also need the hack above unfortunately...
    json(),

    // NOTE: You may need the following hacks if we ever decide to update ink to the latest version
    // HACK: make yoga.wasm import compatible with rollup in tmp/pkg/core/node_modules/ink/node_modules/yoga-wasm-web/dist/node.js
    replace({
      include: [/yoga-wasm-web.*node\.js$/],
      values: {
        // I'm really sorry for anyone who has to update this whenever a new version of yoga-wasm-web is released.
        // Let's hope that rollup supports module.createRequire(import.meta.url).resolve(...) soon. Tracking issue: https://github.com/rollup/rollup/issues/4274
        'let Yoga=await a(await E(_(import.meta.url).resolve("./yoga.wasm")))': `let Yoga=await a(Buffer.from(require('./yoga.wasm').default.split(';base64,').pop(), 'base64'))`,
      },
      delimiters: ["", ""],
    }),
    // NOTE: this works together with the hack above to make wasm load work for yoga-wasm-web in rollup
    url({
      include: [/\.wasm$/],
      emitFiles: false,
      limit: 1024 * 1024 * 1024 * 100, // 100MB
    }),

    // // See also https://github.com/diegomura/react-pdf/issues/662#issuecomment-529967136
    // replace({
    //   include: [/yoga-layout-prebuilt/],
    //   values: {
    //     "_a = _typeModule(_typeModule),": "var _a = _typeModule(_typeModule);",
    //   },
    //   delimiters: ["", ""],
    // }),

    // See also https://github.com/open-telemetry/opentelemetry-js/issues/3954
    replace({
      include: [/opentelemetry.*instrumentation\.js/],
      values: {
        "import * as ImportInTheMiddle from 'import-in-the-middle'": "import ImportInTheMiddle from 'import-in-the-middle'"
      },
      delimiters: ["", ""],
    }),

    replace({
      include: [/.*\.js/],
      values: {
        "__dirname": "`./`",
        "__filename": "`garden.mjs`",
      },
      preventAssignment: true,
    }),

    nodeResolve({
      exportConditions: ["node"],
      preferBuiltins: true,
    }),
    commonjs({
      // For OpenTelemetry
      transformMixedEsModules: true,
      // for .node native modules and eventually, in the future, possibly external plugins
      ignoreDynamicRequires: true,
      ignore: (id) => {
        // https://github.com/open-telemetry/opentelemetry-js/issues/3759
        if (id === "@opentelemetry/exporter-jaeger") {
          return true
        }

        if (id.endsWith(".node")) {
          return true
        }

        return false
      },
    }),
    // This is needed to import native modules.
    // See also https://stackoverflow.com/a/66527729
    {
      name: "add global require",
      generateBundle: (_options, bundle) => {
        for (const file of Object.values(bundle)) {
          if (file.type === "chunk") {
            file.code = file.code.replace(/^#!(.*)/m, `#!$1
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`)
          }
        }
      }
    },
  ]
};
