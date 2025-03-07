/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DOCS_BASE_URL, GardenApiVersion } from "../constants.js"
import { styles } from "../logger/styles.js"
import { GardenError, RuntimeError } from "../exceptions.js"
import { emitNonRepeatableWarning } from "../warnings.js"
import type { Log } from "../logger/log-entry.js"
import dedent from "dedent"
import { deline } from "./string.js"
import type { SyncCommandName } from "../commands/sync/sync.js"

const deprecatedPluginNames = ["conftest", "conftest-container", "conftest-kubernetes", "hadolint", "octant"] as const
export type DeprecatedPluginName = (typeof deprecatedPluginNames)[number]

export function isDeprecatedPlugin(pluginName: string): pluginName is DeprecatedPluginName {
  for (const deprecatedPluginName of deprecatedPluginNames) {
    if (deprecatedPluginName === pluginName) {
      return true
    }
  }
  return false
}

export type DeprecatedDeployActionType = "configmap" | "persistentvolumeclaim"

export function getDeprecations(style: (s: string) => string = styles.highlight) {
  return {
    containerDeploymentStrategy: {
      contextDesc: "Kubernetes provider configuration",
      featureDesc: `The ${style("deploymentStrategy")} config field`,
      hint: `Do not use this config field. It has no effect as the experimental support for blue/green deployments (via the ${style(`blue-green`)} strategy) has been removed.`,
      docs: null,
    },
    dotIgnoreFiles: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("dotIgnoreFiles")} config field`,
      hint: `Use the ${style("dotIgnoreFile")} field instead. It only allows specifying one filename.`,
      docs: dedent`
      For more information, please refer to the [${style("dotIgnoreFile")} reference documentation](../reference/project-config.md#dotIgnoreFile).
      `,
    },
    apiVersionV0: {
      contextDesc: "Project configuration",
      featureDesc: `Using ${style(`apiVersion: ${GardenApiVersion.v0}`)} in the project config`,
      hint: dedent`
        Use ${style(`apiVersion: ${GardenApiVersion.v1}`)} or higher instead.
      `,
      docs: dedent`
        Using \`apiVersion: garden.io/v0\`, or not specifying \`apiVersion\` at all in the project configuration, indicates the configuration has been written for Garden version 0.12 (Acorn).

        To indicate that your configuration has been written for Garden 0.13 (Bonsai), use \`apiVersion: garden.io/v1\` instead.

        Full Example:
        \`\`\`yaml
        # project.garden.yml
        apiVersion: garden.io/v1 # <-- This indicates that the configuration has been written for Garden 0.13 (Bonsai).
        kind: Project
        name: garden-core

        environments:
         - name: dev

        providers:
         - name: local-kubernetes
        \`\`\`

        For more information, please refer to the [${style("apiVersion")} reference documentation](../reference/project-config.md#apiVersion).
      `,
    },
    projectConfigModules: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("modules")} config field`,
      hint: `Do not use the ${style("modules")} field, as it has been renamed to ${style("scan")}. Please use the ${style("scan")} field instead.`,
      docs: dedent`
        For more information, please refer to the [${style("scan")} reference documentation](../reference/project-config.md#scan).
      `,
    },
    kubernetesClusterInitCommand: {
      contextDesc: "Garden commands",
      featureDesc: `${style("garden kubernetes cluster-init")}`,
      hint: "Do not use this command. It has no effect.",
      docs: null,
    },
    syncStartCommand: {
      contextDesc: "Garden commands",
      featureDesc: `${style("garden sync start")}`,
      hint: deline`The command ${style("garden sync start")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.`,
      docs: dedent`Please run ${style("garden deploy --sync")} instead, to start the dev console.

      You can also start the dev console by running ${style("garden dev")} and then use the ${style("sync start")} command inside the dev shell. The same applies to all other sync commands.`,
    },
    syncStopCommand: {
      contextDesc: "Garden commands",
      featureDesc: `${style("garden sync stop")}`,
      hint: deline`The command ${style("garden sync stop")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.
        Instead, we recommend running ${style("garden deploy --sync")}, or alternatively starting syncs inside the dev console (${style("garden dev")}) using ${style("sync stop")}.`,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        See also [the deprecation notice for the ${style("garden sync start")} command](#syncStartCommand).
      `,
    },
    syncRestartCommand: {
      contextDesc: "Garden commands",
      featureDesc: `${style("garden sync restart")}`,
      hint: deline`The command ${style("garden sync restart")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.`,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        See also [the deprecation notice for the ${style("garden sync start")} command](#syncStartCommand).
      `,
    },
    syncStatusCommand: {
      contextDesc: "Garden commands",
      featureDesc: `${style("garden sync status")}`,
      hint: deline`The command ${style("garden sync status")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.
      `,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        See also [the deprecation notice for the ${style("garden sync start")} command](#syncStartCommand).
      `,
    },
    hadolintPlugin: {
      contextDesc: "Garden Plugins",
      featureDesc: `The ${style("hadolint")} plugin`,
      hint: `Do not use the ${style("hadolint")} plugin explicitly, as it will be removed in the next version of Garden, 0.14.`,
      docs: dedent`
        [Hadolint](https://github.com/hadolint/hadolint) is a Dockerfile linter written in Haskell. It can be used to enforce best practices.

        If you want to keep using hadolint, you can use an ${style("exec")} action instead:

        \`\`\`yaml
        kind: test
        type: exec
        name: dockerfile-hadolint
        include: ["Dockerfile"]
        spec:
          command: [hadolint, "Dockerfile"]
        \`\`\`
      `,
    },
    octantPlugin: {
      contextDesc: "Garden Plugins",
      featureDesc: `The ${style("octant")} plugin`,
      hint: `Do not use the ${style("octant")} plugin explicitly, as it will be removed in the next version of Garden, 0.14.`,
      docs: `The ${style("octant")} plugin does not have any effect since the integrated dashboard has been removed in Garden 0.13.0.`,
    },
    conftestPlugin: {
      contextDesc: "Garden Plugins",
      featureDesc: `The ${style("conftest")} plugin`,
      hint: `Do not use the ${style("conftest")} plugin explicitly, as it will be removed in the next version of Garden, 0.14.`,
      docs: dedent`
        [Conftest](https://www.conftest.dev/) is a utility to help you write tests against structured configuration data.

        If you want to keep using conftest, you can use an ${style("exec")} action instead:

        \`\`\`yaml
        kind: test
        type: exec
        name: conftest
        include:
        - "policy/**/*.rego"
        - deployment.yaml
        spec:
          command: [conftest, test, deployment.yaml]
        \`\`\`
      `,
    },
    ephemeralKubernetesProvider: {
      contextDesc: "Garden Plugins",
      featureDesc: `The ${style("ephemeral-kubernetes")} provider of the ${style("kubernetes")} plugin`,
      hint: deline`
      Use ${style("kubernetes")} or ${style("local-kubernetes")} providers instead.
      We are currently exploring how to improve and offer a new hosted Kubernetes experience in the future – reach out on GitHub or Discord if you are interested or have any feedback!
      `,
      docs: null, // TODO: add link and update tutorials and guides
    },
    localMode: {
      contextDesc: "Local mode",
      featureDesc: `Using ${style("spec.localMode")} in ${style("helm")}, ${style("kubernetes")} and ${style("container")} deploy actions`,
      hint: dedent`The local mode will be removed in the next major version of Garden, 0.14.`,
      docs: dedent`
        Use the ${style("sync mode")} instead. You can also consider using [mirrord](https://mirrord.dev/) or [telepresence](https://www.telepresence.io/).

        See also:
        - [${style("spec.localMode")} in the ${style("kubernetes")} deploy action reference](../reference/action-types/Deploy/container.md#spec.localmode).
        - [${style("spec.localMode")} in the ${style("helm")} deploy action reference](../reference/action-types/Deploy/helm.md#spec.localmode).
        - [${style("spec.localMode")} in the ${style("container")} deploy action reference](../reference/action-types/Deploy/container.md#spec.localmode).
      `,
    },
    buildConfigFieldOnRuntimeActions: {
      contextDesc: "Action configs",
      featureDesc: `The ${style("build")} config field in runtime action configs`,
      hint: `Use ${style("dependencies")} config build to define the build dependencies.`,
      docs: dedent`
        Please replace all root-level configuration entries like \`build: my-app\` with the \`dependencies: [build.my-app]\`.

        For example, a configuration like

        \`\`\`yaml
        kind: Build
        name: backend
        description: Backend service container image
        type: container

        ---
        kind: Deploy
        name: backend
        description: Backend service container
        type: container
        build: backend # <-- old config style uses \`build\` field

        spec:
        image: \${actions.build.backend.outputs.deploymentImageId}
        ...
        \`\`\`

        should be replaced with

        \`\`\`yaml
        kind: Build
        name: backend
        description: Backend service container image
        type: container

        ---
        kind: Deploy
        name: backend
        description: Backend service container
        type: container

        # use \`dependencies\` field instead of the \`build\`
        dependencies:
        - build.backend

        spec:
        image: \${actions.build.backend.outputs.deploymentImageId}
        ...
        \`\`\`
      `,
    },
    rsyncBuildStaging: {
      contextDesc: "Build Staging",
      featureDesc: `${style("rsync")}-based build staging`,
      hint: `Do not use ${style("GARDEN_LEGACY_BUILD_STAGE")} environment variable in 0.14.`,
      docs: dedent`
        Using the ${style("rsync")}-based build staging is not necessary when using the latest versions of Garden.

        If you still need to use this environment variable for some reason, please reach out to us on GitHub, Discord or via the customer support.
      `,
    },
    configmapDeployAction: {
      contextDesc: "Garden action types",
      featureDesc: `The ${style("configmap")} deploy action type`,
      hint: `The ${style("configmap")} deploy action type will be removed in the next major version of Garden, 0.14. Please use the ${style("kubernetes")} deploy action type with a ${style("configmap")} Kubernetes manifest instead.`,
      docs: dedent`
        Example:

        \`\`\`yaml
        # garden.yml
        kind: Deploy
        type: kubernetes
        name: game-demo-configmap
        spec:
          manifests:
            - apiVersion: v1
              kind: ConfigMap
              metadata:
                name: game-demo
              data:
                player_initial_lives: "3"
                ui_properties_file_name: "user-interface.properties"
                game.properties: |
                  enemy.types=aliens,monsters
                  player.maximum-lives=5
                user-interface.properties: |
                  color.good=purple
                  color.bad=yellow
                  allow.textmode=true
        \`\`\`
      `,
    },
    persistentvolumeclaimDeployAction: {
      contextDesc: "Garden action types",
      featureDesc: `The ${style("persistentvolumeclaim")} deploy action type`,
      hint: `The ${style("persistentvolumeclaim")} deploy action type will be removed in the next major version of Garden, 0.14. Please use the ${style("kubernetes")} deploy action type instead.`,
      docs: dedent`
        For more information how to use Persistent Volume Claims using Kubernetes manifests, refer to the [official Kubernetes documentation on configuring persistent volume storage](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/).
      `,
    },
    optionalTemplateValueSyntax: {
      contextDesc: "Template Language",
      featureDesc: `The optional template value syntax (like ${style(`\${var.foo}?`)})`,
      hint: `Use explicit fallback values instead, e.g. ${style(`\${var.foo || "defaultValue"}`)}.`,
      docs: dedent`
        There were some issues with the syntax for optional template values in the template language.

        For example, what do you expect the following template to evaluate to:

        \`\`\`yaml
        # ...
        variables:
          baseUrl: https://example.com/
          fullUrl: \${var.baseUrl}?param=xyz # <-- users expect this to evaluate to https://example.com/?param=xyz
        \`\`\`

        When using \`apiVersion: garden.io/v1\`, the question mark is considered part of the template expression and thus \`fullUrl\` evaluates to \`https://example.com/param=xyz\` and there is no error if \`var.baseUrl\` doesn't exist.

        When using \`apiVersion: garden.io/v2\`, the question mark operator has been removed and thus \`fullUrl\` evaluates to \`https://example.com/?param=xyz\` and resolving the action will fail if \`var.baseUrl\` doesn't exist.
      `,
    },
    waitForJobs: {
      contextDesc: "Default configuration values",
      featureDesc: `${style("spec.waitForJobs")} of ${style("kubernetes Deploy")}`,
      hint: `The new default value is ${style("true")}`,
      docs: dedent`
        This means that deploy actions will wait for jobs to complete by default when applying Job manifests. For more information about jobs, please refer to the [official Kubernetes documentation on Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/).
      `,
    },
  } as const
}

export type Deprecation = keyof ReturnType<typeof getDeprecations>

export const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/guides/deprecations`

export function makeDeprecationMessage({
  deprecation,
  includeLink,
  style,
}: {
  deprecation: Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  const { featureDesc, hint } = getDeprecations(style ? styles.highlight : (s) => `\`${s}\``)[deprecation]

  const lines = [`${featureDesc} is deprecated in 0.13 and will be removed in the next major release, Garden 0.14.`]

  if (hint) {
    lines.push(hint)
  }

  if (includeLink) {
    let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation}`
    if (style) {
      link = styles.link(link)
    }
    lines.push(
      `To make sure your configuration does not break when we release Garden 0.14, please follow the steps at ${link}`
    )
  }

  return lines.join("\n")
}

class FeatureNotAvailable extends GardenError {
  override type = "deprecated-feature-unavailable" as const

  constructor({ deprecation, apiVersion }: { deprecation: Deprecation; apiVersion: GardenApiVersion }) {
    const { featureDesc, hint } = getDeprecations()[deprecation]
    const lines = [
      `${featureDesc} has been deprecated and is not available when using ${styles.highlight(`apiVersion: ${apiVersion}`)} in your project configuration file.`,
    ]

    if (hint) {
      lines.push(hint)
    }

    const link = styles.link(DOCS_DEPRECATION_GUIDE)
    lines.push(
      `Avoiding to use this feature will ensure that your configuration does not break when we release Garden 0.14. For more information, see ${link}`
    )

    super({ message: lines.join("\n") })
  }
}

type DeprecationWarningParams = {
  apiVersion: GardenApiVersion
  log: Log
  deprecation: Deprecation
}

export function reportDeprecatedFeatureUsage({ apiVersion, log, deprecation }: DeprecationWarningParams) {
  if (apiVersion === GardenApiVersion.v2) {
    throw new FeatureNotAvailable({ apiVersion, deprecation })
  }

  const warnMessage = makeDeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nDEPRECATION WARNING: ${warnMessage}\n`)
}

export function reportDeprecatedSyncCommandUsage({
  apiVersion,
  log,
  deprecation,
  syncCommandName,
}: {
  apiVersion: GardenApiVersion
  log: Log
  deprecation: Deprecation
  syncCommandName: SyncCommandName
}) {
  if (apiVersion === GardenApiVersion.v2) {
    const message = deline`
    Command ${styles.command(`sync ${syncCommandName}`)} can only be executed in the dev console.
    Please, use start the dev console with ${styles.command("garden dev")}. Aborting.
    `
    throw new RuntimeError({ message })
  }

  reportDeprecatedFeatureUsage({
    apiVersion,
    log,
    deprecation,
  })
}

export function makeDefaultConfigChangeMessage({
  deprecation,
  includeLink,
  style,
}: {
  deprecation: Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  const { featureDesc, hint } = getDeprecations(style ? styles.highlight : (s) => `\`${s}\``)[deprecation]

  const lines = [
    `The default value of ${featureDesc} configuration will be changed in the next major release, Garden 0.14.`,
  ]

  if (hint) {
    lines.push(hint)
  }

  if (includeLink) {
    let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation}`
    if (style) {
      link = styles.link(link)
    }
    lines.push(
      `To make sure your configuration does not break when we release Garden 0.14, please follow the steps at ${link}`
    )
  }

  return lines.join("\n")
}

export function reportDefaultConfigValueChange({ apiVersion, log, deprecation }: DeprecationWarningParams) {
  if (apiVersion === GardenApiVersion.v2) {
    return
  }

  const warnMessage = makeDefaultConfigChangeMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nDEFAULT VALUE WILL CHANGE: ${warnMessage}\n`)
}
