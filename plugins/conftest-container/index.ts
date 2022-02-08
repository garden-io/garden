/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { relative, resolve } from "path"
import { createGardenPlugin } from "@garden-io/sdk"
import { ConftestProvider } from "@garden-io/garden-conftest"
import { dedent } from "@garden-io/sdk/util/string"

// TODO: remove direct references to @garden-io/core
import { containerHelpers } from "@garden-io/core/build/src/plugins/container/helpers"
import { getModuleTypeUrl } from "@garden-io/core/build/src/docs/common"

const moduleTypeUrl = getModuleTypeUrl("conftest")

/**
 * Auto-generates a conftest module for each container module in your project
 */
export const gardenPlugin = () =>
  createGardenPlugin({
    name: "conftest-container",
    base: "conftest",
    dependencies: [{ name: "container" }],
    docs: dedent`
    This provider automatically generates [conftest modules](${moduleTypeUrl}) for \`container\` modules in your project. A \`conftest\` module is created for each \`container\` module that includes a Dockerfile that can be validated.

    Simply add this provider to your project configuration, and configure your policies. Check out the below reference for how to configure default policies, default namespaces, and test failure thresholds for the generated modules.
  `,
    handlers: {
      augmentGraph: async ({ ctx, modules }) => {
        const provider = ctx.provider as ConftestProvider

        const allModuleNames = new Set(modules.map((m) => m.name))

        const existingConftestModuleDockerfiles = modules
          .filter((m) => m.compatibleTypes.includes("conftest"))
          .map((m) => resolve(m.path, m.spec.dockerfilePath))

        return {
          addModules: await Bluebird.filter(modules, async (module) => {
            const dockerfilePath = containerHelpers.getDockerfileSourcePath(module)

            return (
              // Pick all container or container-based modules
              module.compatibleTypes.includes("container") &&
              // Make sure we don't step on an existing custom conftest module
              !existingConftestModuleDockerfiles.includes(dockerfilePath) &&
              // Only create for modules with Dockerfiles
              containerHelpers.hasDockerfile(module, module.version)
            )
          }).map((module) => {
            const baseName = "conftest-" + module.name

            let name = baseName
            let i = 2

            while (allModuleNames.has(name)) {
              name = `${baseName}-${i++}`
            }

            allModuleNames.add(name)

            return {
              kind: "Module",
              type: "conftest",
              name,
              description: `conftest test for module '${module.name}' (auto-generated by conftest-container)`,
              path: module.path,
              policyPath: provider.config.policyPath,
              namespace: provider.config.namespace,
              combine: false,
              files: [relative(module.path, containerHelpers.getDockerfileSourcePath(module))],
            }
          }),
        }
      },
    },
  })
