/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "@garden-io/sdk"
import { ConftestProvider } from "@garden-io/garden-conftest"
import { dedent } from "@garden-io/sdk/util/string"

/**
 * Auto-generates a conftest module for each container module in your project
 */
export const gardenPlugin = () =>
  createGardenPlugin({
    name: "conftest-container",
    base: "conftest",
    dependencies: [{ name: "container" }],
    docs: dedent`
    This provider automatically generates [conftest modules](../module-types/conftest.md) for \`container\` modules in your project. A \`conftest\` module is created for each \`container\` module that includes a Dockerfile that can be validated.

    Simply add this provider to your project configuration, and configure your policies. Check out the below reference for how to configure default policies, default namespaces, and test failure thresholds for the generated modules.
  `,
    handlers: {
      augmentGraph: async ({ ctx, actions }) => {
        const provider = ctx.provider as ConftestProvider

        const allTestNames = new Set(actions.filter((a) => a.kind === "Test").map((m) => m.name))

        return {
          addActions: actions
            .filter(
              (action) =>
                // Pick all container or container-based Builds
                action.kind === "Build" && action.isCompatible("container")
            )
            .map((action) => {
              const baseName = "conftest-" + action.name

              let name = baseName
              let i = 2

              while (allTestNames.has(name)) {
                name = `${baseName}-${i++}`
              }

              allTestNames.add(name)

              return {
                kind: "Test",
                type: "conftest",
                name,
                description: `conftest test for module '${action.name}' (auto-generated by conftest-container)`,
                internal: {
                  basePath: action.basePath(),
                },
                spec: {
                  policyPath: provider.config.policyPath,
                  namespace: provider.config.namespace,
                  combine: false,
                  files: [action.getConfig("spec").dockerfilePath],
                },
              }
            }),
        }
      },
    },
  })
