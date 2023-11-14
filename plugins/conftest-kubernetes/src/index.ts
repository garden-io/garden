/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import slash from "slash"
import { relative, resolve } from "path"
import { createGardenPlugin } from "@garden-io/sdk"
import type { ConftestProvider } from "@garden-io/garden-conftest/build/src/index.js"

// TODO: remove direct references to @garden-io/core
import { dedent } from "@garden-io/core/build/src/util/string.js"
import { getGitHubUrl } from "@garden-io/core/build/src/docs/common.js"

const gitHubUrl = getGitHubUrl("examples/conftest")

/**
 * Auto-generates a conftest module for each helm and kubernetes module in your project
 */
export const gardenPlugin = () =>
  createGardenPlugin({
    name: "conftest-kubernetes",
    base: "conftest",
    dependencies: [{ name: "kubernetes" }],
    docs: dedent`
    This provider automatically generates [conftest Test actions](../action-types/Test/conftest.md) for \`kubernetes\` and
    \`helm\` Deploys in your project. A \`conftest\` Test is created for each of those action types.

    Simply add this provider to your project configuration, and configure your policies. Check out the below
    reference for how to configure default policies, default namespaces, and test failure thresholds for the generated
    actions.

    See the [conftest example project](${gitHubUrl}) for a simple
    usage example.
  `,
    handlers: {
      augmentGraph: async ({ ctx, actions }) => {
        const provider = ctx.provider as ConftestProvider

        const allTestNames = new Set(actions.filter((a) => a.kind === "Test").map((m) => m.name))

        return {
          addActions: actions
            .filter((action) => {
              return (
                // Pick all kubernetes or helm modules
                action.isCompatible("kubernetes") || action.isCompatible("helm")
              )
            })
            .map((action) => {
              const baseName = "conftest-" + action.name

              let name = baseName
              let i = 2

              while (allTestNames.has(name)) {
                name = `${baseName}-${i++}`
              }

              allTestNames.add(name)

              // Make sure the policy path is valid POSIX on Windows
              const policyPath = slash(
                relative(action.sourcePath(), resolve(ctx.projectRoot, provider.config.policyPath))
              )

              const isHelmModule = action.isCompatible("helm")
              const files = action.getConfig().spec.files || ["*.yaml", "**/*.yaml", "*.yml", "**/*.yml"]

              if (isHelmModule) {
                return {
                  kind: "Test",
                  type: "conftest-helm",
                  name,
                  description: `conftest test for '${action.longDescription()}' (auto-generated by conftest-kubernetes)`,
                  internal: {
                    basePath: action.sourcePath(),
                  },
                  timeout: action.getConfig().timeout,
                  spec: {
                    policyPath,
                    namespace: provider.config.namespace,
                    combine: false,
                    files,
                    helmDeploy: action.name,
                  },
                  dependencies: [{ kind: "Deploy", name: action.name }],
                }
              } else {
                return {
                  kind: "Test",
                  type: "conftest",
                  name,
                  description: `conftest test for module '${action.longDescription()}' (auto-generated by conftest-kubernetes)`,
                  internal: {
                    basePath: action.sourcePath(),
                  },
                  timeout: action.getConfig().timeout,
                  spec: {
                    policyPath,
                    namespace: provider.config.namespace,
                    combine: false,
                    files,
                  },
                }
              }
            }),
        }
      },
    },
  })
