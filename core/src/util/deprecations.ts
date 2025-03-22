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
import { getGlobalProjectApiVersion } from "../project-api-version.js"

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
    loginRequirement: {
      docsSection: "Garden commands",
      docsHeadline: "Login requirement",
      warnHint: dedent`
        For projects that are connected to Garden Cloud/Enterprise, Garden 0.14 will require you to login.
      `,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        To suppress this warning and adopt the new behaviour described below, change the \`apiVersion\` setting in your project-level configuration to \`garden.io/v2\` (See also [The ${style(`apiVersion`)} config field](#apiversion)).

        ### Why

        <!-- markdown-link-check-disable-next-line -->
        Garden 0.14 will use the Garden Cloud/Enterprise backend for determining the cache status of Kubernetes \`Test\` and \`Run\` actions kinds (See also [${style("ConfigMap")}-based cache for Kubernetes actions](#configmapbasedcache)).

        While we also introduce a local file-based cache backend, this means the cache results from other team members will only be available when you're logged in to Garden Cloud/Enterprise.

        Logging in also enables you to use our Remote Container Builder which can significantly improve your Docker build performance.

        To prevent your team from suffering from cache misses and bad performance, we'll require you to log in if your project is connected to Garden Cloud/Enterprise. A project is _connected_ if the project-level Garden configuration has \`id\` and \`domain\` fields set.

        ### Offline mode

        **We don't want to be in your way if you can't log in right now**, be it because you are lacking permissions or because you're offline.

        This is why we also offer an escape hatch: If you want to proceed without logging in, just call Garden with the option \`--offline\` or the environment variable \`GARDEN_OFFLINE=1\`.
      `,
    },
    configMapBasedCache: {
      docsSection: "Garden commands",
      docsHeadline: `${style("ConfigMap")}-based cache for Kubernetes actions`,
      warnHint: dedent`
        The ${style("ConfigMap")}-based cache will not be available anymore in Garden 0.14.
      `,
      docs: dedent`
        Instead, Garden 0.14 will introduce two new cache storage options: A local file-based cache and a Team Cache as part of Garden Cloud/Enterprise.

        <!-- markdown-link-check-disable-next-line -->
        To suppress this warning, change the \`apiVersion\` setting in your project-level configuration to \`garden.io/v2\` (See also [The ${style(`apiVersion`)} config field](#apiversion)).

        ### Why

        We are making this change because \`ConfigMap\` resources in your Kubernetes cluster are not designed for storing \`Test\` and \`Run\` action statuses and have limitations on the amount of data that can be stored for each cache entry.

        We've seen Kubernetes clusters where the number of \`ConfigMap\` resources grew significantly and caused reliability issues.

        Additionally, the storage location of the cache limits the functionality: it's impossible, for instance, to share test results across multiple Kubernetes clusters. If your team is using the \`local-kubernetes\` provider, they cannot benefit from the cache of other team members.

        ### Team Cache backend

        With Garden 0.14, we are offering a **Team Cache** option with a new storage backend in Garden Cloud/Enterprise, putting us in the position of bringing Garden caching capabilities to the next level.

        The Team Cache backend will be enabled by default for all projects that are connected to Garden Cloud/Enterprise. A project is _connected_ if the project-level Garden configuration has \`id\` and \`domain\` fields set.

        <!-- markdown-link-check-disable-next-line -->
        We'll also introduce a login requirement for these projects. See also [Login Requirement](#loginrequirement) for more information.

        ### File-based backend

        For projects that aren't connected to Garden Cloud/Enterprise, or when you're using the \`--offline\` option, we will automatically fall back to a file-based cache backend.

        Garden will skip \`Test\` and \`Run\` actions that already ran from your local machine, but team members and CI workflows won't be able to benefit from the cache entries on your local machine.
      `,
    },
    containerDeploymentStrategy: {
      docsSection: "Kubernetes provider configuration",
      docsHeadline: `The ${style("deploymentStrategy")} config field`,
      warnHint: dedent`
        The ${style("deploymentStrategy")} config field will be removed in Garden 0.14.
        Do not use this config field. It has no effect as the experimental support for blue/green deployments (via the ${style(`blue-green`)} strategy) has been removed.`,
      docs: null,
    },
    kubernetesActionSpecFiles: {
      docsSection: "Action configs",
      docsHeadline: `${style("spec.files")} in ${style("kubernetes")} Deploy actions`,
      warnHint: `${style("spec.files")} in ${style("kubernetes")} Deploy actions will be removed in Garden 0.14. Use ${style("spec.manifestTemplates")} and/or ${style("spec.manifestFiles")} instead.`,
      docs: dedent`
        If you want to keep using the Garden template language in your Kubernetes manifest files, use \`spec.manifestTemplates\`.

        If you need to keep your Kubernetes manifests files compatible with \`kubectl\`, in other words, you don't want to use the Garden template language in your manifest files, use \`spec.manifestFiles\` instead.

        Example:

        \`\`\`yaml
        # garden.yml
        kind: Deploy
        type: kubernetes
        name: my-app
        spec:
          manifestFiles:
            - manifests/**/*.yml # <-- Treat these files as pure Kubernetes manifest files
          manifestTemplates:
            - manifests/**/*.yml.tpl # <-- Use the Garden template language in files that end with \`.yml.tpl\`.
        \`\`\`

        ### Why

        Until now there wasn't a choice: Garden would always attempt to resolve template strings like ${style("${fooBar}")} in Kubernetes manifest files.

        This becomes problematic when, for example, the Kubernetes manifest contains a bash script:

        \`\`\`yaml
        # manifests/bash-script.yml
        apiVersion: v1
        kind: ConfigMap
        metadata:
          name: bash-scripts
        data:
            important-bash-script.sh: |
              #!/bin/bash
              echo "hello \${USERNAME:=world}"
        \`\`\`

        This manifest file is valid and works when applied using \`kubectl apply < manifests/bash-script.yml\`.

        Using this manifest file like so will not work as expected, but throw a template syntax error:

        \`\`\`yaml
        # garden.yml
        kind: Deploy
        type: kubernetes
        name: bash-scripts
        spec:
          files:
            - manifests/bash-script.yml # <-- Garden will parse template strings in \`manifests/bash-script.yml\` and fail with a syntax error.
        \`\`\`

        One way to work around this problem in the past was to escape the template string by prepending a \`$\` sign in the script; But this work-around also means that the manifest isn't compatible with \`kubectl apply\` anymore:

        \`\`\`bash
        #!/bin/bash
        echo "hello $\${USERNAME:=world}" # <-- This is not a working bash script anymore :(
        \`\`\`
      `,
    },
    dotIgnoreFiles: {
      docsSection: "Project configuration",
      docsHeadline: `The ${style("dotIgnoreFiles")} config field`,
      warnHint: dedent`
        The ${style("dotIgnoreFiles")} config field will be removed in Garden 0.14.
        Use the ${style("dotIgnoreFile")} field instead. It only allows specifying one filename.
      `,
      docs: dedent`
      For more information, please refer to the [${style("dotIgnoreFile")} reference documentation](../reference/project-config.md#dotIgnoreFile).
      `,
    },
    apiVersion: {
      docsSection: "Project configuration",
      docsHeadline: `The ${style(`apiVersion`)} config field`,
      warnHint: dedent`
        Garden 0.14 will introduce breaking changes.
      `,
      docs: dedent`
        Garden uses the \`apiVersion\` setting in your project configuration to understand which version of Garden your configuration has been written for.

        Garden 0.14 (Cedar) will only support the setting \`apiVersion: garden.io/v2\` in your project configuration file. Using this setting in the latest versions of Garden 0.13 (Bonsai) will reject using functionality that is not supported in Garden 0.14 (Cedar) anymore.

        Using \`apiVersion: garden.io/v0\`, or not specifying \`apiVersion\` at all in the project configuration, indicates the configuration has been written for Garden version 0.12 (Acorn), and using \`apiVersion: garden.io/v1\` means your configuration has been written for Garden version 0.13 (Bonsai). **These settings will not be supported anymore in Garden 0.14 (Cedar)**.

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

        Please follow the steps in this document when Garden tells you that you're affected by changed behaviour in 0.14. After that, you can change your \`apiVersion\` setting to \`garden.io/v2\`:

        \`\`\`yaml
        # project.garden.yml
        apiVersion: garden.io/v2 # <-- Use this setting to adopt the new behaviour in Garden 0.14. Your configuration will work with the latest versions of Garden 0.13, and with any version of Garden 0.14.
        kind: Project
        name: garden-core

        environments:
         - name: dev

        providers:
         - name: local-kubernetes
        \`\`\`
      `,
    },
    projectConfigModules: {
      docsSection: "Project configuration",
      docsHeadline: `The ${style("modules")} config field`,
      warnHint: `The ${style("modules")} config field will be removed in Garden 0.14. Do not use the ${style("modules")} field, as it has been renamed to ${style("scan")}. Please use the ${style("scan")} field instead.`,
      docs: dedent`
        For more information, please refer to the [${style("scan")} reference documentation](../reference/project-config.md#scan).
      `,
    },
    kubernetesClusterInitCommand: {
      docsSection: "Garden commands",
      docsHeadline: `${style("garden kubernetes cluster-init")}`,
      warnHint: "This command will be removed in 0.14. Do not use this command. It has no effect.",
      docs: null,
    },
    syncStartCommand: {
      docsSection: "Garden commands",
      docsHeadline: `${style("garden sync start")}`,
      warnHint: deline`The command ${style("garden sync start")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.`,
      docs: dedent`Please run ${style("garden deploy --sync")} instead, to start the dev console.

      You can also start the dev console by running ${style("garden dev")} and then use the ${style("sync start")} command inside the dev shell. The same applies to all other sync commands.`,
    },
    syncStopCommand: {
      docsSection: "Garden commands",
      docsHeadline: `${style("garden sync stop")}`,
      warnHint: deline`The command ${style("garden sync stop")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.
        Instead, we recommend running ${style("garden deploy --sync")}, or alternatively starting syncs inside the dev console (${style("garden dev")}) using ${style("sync stop")}.`,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        See also [the deprecation notice for the ${style("garden sync start")} command](#syncstartcommand).
      `,
    },
    syncRestartCommand: {
      docsSection: "Garden commands",
      docsHeadline: `${style("garden sync restart")}`,
      warnHint: deline`The command ${style("garden sync restart")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.`,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        See also [the deprecation notice for the ${style("garden sync start")} command](#syncstartcommand).
      `,
    },
    syncStatusCommand: {
      docsSection: "Garden commands",
      docsHeadline: `${style("garden sync status")}`,
      warnHint: deline`The command ${style("garden sync status")} will only be available inside the dev console (${style("garden dev")}) in the next major version of Garden, 0.14.
        Do not use it as a standalone Garden command.
      `,
      docs: dedent`
        <!-- markdown-link-check-disable-next-line -->
        See also [the deprecation notice for the ${style("garden sync start")} command](#syncstartcommand).
      `,
    },
    hadolintPlugin: {
      docsSection: "Garden plugins",
      docsHeadline: `The ${style("hadolint")} plugin`,
      warnHint: `Do not use the ${style("hadolint")} plugin explicitly, as it will be removed in the next version of Garden, 0.14.`,
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
      docsSection: "Garden plugins",
      docsHeadline: `The ${style("octant")} plugin`,
      warnHint: `Do not use the ${style("octant")} plugin explicitly, as it will be removed in the next version of Garden, 0.14.`,
      docs: `The ${style("octant")} plugin does not have any effect since the integrated dashboard has been removed in Garden 0.13.0.`,
    },
    conftestPlugin: {
      docsSection: "Garden plugins",
      docsHeadline: `The ${style("conftest")} plugin`,
      warnHint: `Do not use the ${style("conftest")} plugin explicitly, as it will be removed in the next version of Garden, 0.14.`,
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
      docsSection: "Garden plugins",
      docsHeadline: `The ${style("ephemeral-kubernetes")} provider`,
      warnHint: deline`
        Use the ${style("kubernetes")} or ${style("local-kubernetes")} providers instead.
        We are currently exploring how to improve and offer a new hosted Kubernetes experience in the future – reach out on GitHub or Discord if you are interested or have any feedback!
      `,
      docs: null, // TODO: add link and update tutorials and guides
    },
    localMode: {
      docsSection: "Local mode",
      docsHeadline: `Using ${style("spec.localMode")} in ${style("helm")}, ${style("kubernetes")} and ${style("container")} Deploy actions`,
      warnHint: dedent`The local mode will be removed in the next major version of Garden, 0.14.`,
      docs: dedent`
        Use the ${style("sync mode")} instead. You can also consider using [mirrord](https://mirrord.dev/) or [telepresence](https://www.telepresence.io/).

        See also:
        - [${style("spec.localMode")} in the ${style("kubernetes")} Deploy action reference](../reference/action-types/Deploy/container.md#spec.localmode).
        - [${style("spec.localMode")} in the ${style("helm")} Deploy action reference](../reference/action-types/Deploy/helm.md#spec.localmode).
        - [${style("spec.localMode")} in the ${style("container")} Deploy action reference](../reference/action-types/Deploy/container.md#spec.localmode).
      `,
    },
    buildConfigFieldOnRuntimeActions: {
      docsSection: "Action configs",
      docsHeadline: `The ${style("build")} config field in \`container\` actions`,
      warnHint: `Using the ${style("build")} config field in ${style("container")} actions will not be supported anymore in Garden 0.14.`,
      docs: dedent`
        Instead of using \`build\`, please reference the \`deploymentImageId\` output explicitly in each affected \`Deploy\`, \`Run\` and \`Test\` action spec of the \`container\` action type.

        Other action types, like the \`exec\`, \`kubernetes\` and \`helm\` action types, are not affected and \`build\` can still be used to control the build staging directory of the action.

        Referring to a container image via the \`build\` config field was confusing to some of our users, as it does not work for all action types that can reference containers, for example in \`kubernetes\` and \`helm\` actions configs.

        That's why we decided to drop support for referencing container images via the \`build\` config field.

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
        build: backend # <-- old config style uses \`build\` field. The \`spec.image\` did not need to be specified.
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
        spec:
          image: \${actions.build.backend.outputs.deploymentImageId} # <--- the new config style is more explicit.
        \`\`\`

        Garden automatically determines the execution order of actions (First building the backend container, then deploying the backend) based on the output references.
      `,
    },
    rsyncBuildStaging: {
      docsSection: "Environment variables",
      docsHeadline: `${style("GARDEN_LEGACY_BUILD_STAGE")}`,
      warnHint: `Do not use ${style("GARDEN_LEGACY_BUILD_STAGE")} environment variable. It will be removed in Garden 0.14.`,
      docs: dedent`
        Using the ${style("rsync")}-based build staging is not necessary when using the latest versions of Garden.

        If you still need to use this environment variable for some reason, please reach out to us on GitHub, Discord or via the customer support.
      `,
    },
    configmapDeployAction: {
      docsSection: "Garden action types",
      docsHeadline: `The ${style("configmap")} Deploy action type`,
      warnHint: `The ${style("configmap")} Deploy action type will be removed in the next major version of Garden, 0.14. Please use the ${style("kubernetes")} Deploy action type with a ${style("configmap")} Kubernetes manifest instead.`,
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
      docsSection: "Garden action types",
      docsHeadline: `The ${style("persistentvolumeclaim")} Deploy action type`,
      warnHint: `The ${style("persistentvolumeclaim")} Deploy action type will be removed in the next major version of Garden, 0.14. Please use the ${style("kubernetes")} Deploy action type instead.`,
      docs: dedent`
        For more information how to use Persistent Volume Claims using Kubernetes manifests, refer to the [official Kubernetes documentation on configuring persistent volume storage](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/).
      `,
    },
    optionalTemplateValueSyntax: {
      docsSection: "Template Language",
      docsHeadline: `Optional template expressions`,
      warnHint: `The optional template expression syntax will be removed in Garden 0.14. Use explicit fallback values instead, e.g. ${style(`\${var.foo || null}`)}.`,
      docs: dedent`
        The optional template expression syntax can be used to mark a template expression as optional, meaning there will not be an error when looking up a variable inside the template expression fails.

        Using a question mark (\`?\`) following a template expression to mark it as optional led to surprising and/or undesired behaviour in some cases.

        In the following example, users would expect \`var.fullUrl\` to evaluate to \`https://example.com/?param=xyz\`.

        \`\`\`yaml
        # ...
        variables:
          baseUrl: https://example.com/
          fullUrl: \${var.baseUrl}?param=xyz # <-- users expect this to evaluate to https://example.com/?param=xyz
        \`\`\`

        Due to the optional template expression syntax, the value behind \`var.fullUrl\` actually evaluates to \`https://example.com/param=xyz\` (Notice the missing question mark after the value of \`var.baseUrl\`) when using \`apiVersion: garden.io/v1\`.

        For this reason, we will remove the optional template expression syntax. You can adopt the new behaviour and prepare your configuration files for the release of Garden 0.14 by using \`apiVersion: garden.io/v2\` in the project-level configuration.

        When using \`apiVersion: garden.io/v2\`, the optional template syntax has been removed and thus \`var.fullUrl\` evaluates to \`https://example.com/?param=xyz\` and resolving the action will fail if \`var.baseUrl\` doesn't exist.

        You can use explicit fallback values using the logical or operator in case you've been relying on the optional template expression syntax.
      `,
    },
    waitForJobs: {
      docsSection: "Action configs",
      docsHeadline: `${style("spec.waitForJobs")} in ${style("kubernetes")} Deploy actions`,
      warnHint: `In Garden 0.14, the default value of ${style("spec.waitForJobs")} will change to ${style("true")}.`,
      docs: dedent`
        This means that Deploy actions will wait for Jobs to complete by default when applying Job manifests.

        <!-- markdown-link-check-disable-next-line -->
        To suppress this warning and adopt the new behaviour, change the \`apiVersion\` setting in your project-level configuration to \`garden.io/v2\` (See also [The ${style(`apiVersion`)} config field](#apiversion)).

        For more information about Jobs, please refer to the [official Kubernetes documentation on Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/).
      `,
    },
    gardenCloudBuilder: {
      docsSection: "Garden plugins",
      docsHeadline: `${style("container")} provider configuration`,
      warnHint: `The ${style("gardenCloudBuilder")} setting in the ${style("container")} provider configuration has been renamed to ${style("gardenContainerBuilder")}. Use the setting ${style("gardenContainerBuilder")} instead of ${style("gardenCloudBuilder")}.`,
      docs: null,
    },
    gardenCloudBuilderEnvVar: {
      docsSection: "Environment variables",
      docsHeadline: `${style("GARDEN_CLOUD_BUILDER")}`,
      warnHint: `The ${style("GARDEN_CLOUD_BUILDER")} environment variable will be removed in Garden 0.14. Use ${style("GARDEN_CONTAINER_BUILDER")} instead.`,
      docs: null,
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
  const { docsHeadline, warnHint } = getDeprecations(style ? styles.highlight : (s) => `\`${s}\``)[deprecation]

  const lines: string[] = []
  if (warnHint) {
    lines.push(warnHint)
  } else {
    lines.push(`${docsHeadline} is deprecated in 0.13 and will be removed in the next major release, Garden 0.14.`)
  }

  if (includeLink) {
    let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation.toLowerCase()}`
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

  constructor({ deprecation }: { deprecation: Deprecation }) {
    const { warnHint } = getDeprecations()[deprecation]
    const lines: string[] = [
      `Configuration error: Rejecting use of deprecated functionality due to the \`apiVersion\` setting in your project-level configuration.`,
    ]

    lines.push(warnHint)

    const link = styles.link(DOCS_DEPRECATION_GUIDE)
    lines.push(`Please follow the steps at ${link} to solve this problem.`)

    super({ message: lines.join("\n") })
  }
}

type DeprecationWarningParams = {
  log: Log
  deprecation: Deprecation
}

export function reportDeprecatedFeatureUsage({ log, deprecation }: DeprecationWarningParams) {
  const apiVersion = getGlobalProjectApiVersion()

  if (apiVersion === GardenApiVersion.v2) {
    throw new FeatureNotAvailable({ deprecation })
  }

  const warnMessage = makeDeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nWARNING: ${warnMessage}\n`)
}

export function reportDeprecatedSyncCommandUsage({
  log,
  deprecation,
  syncCommandName,
}: {
  log: Log
  deprecation: Deprecation
  syncCommandName: SyncCommandName
}) {
  const apiVersion = getGlobalProjectApiVersion()

  if (apiVersion === GardenApiVersion.v2) {
    const message = deline`
    Command ${styles.command(`sync ${syncCommandName}`)} can only be executed in the dev console.
    Please, use start the dev console with ${styles.command("garden dev")}. Aborting.
    `
    throw new RuntimeError({ message })
  }

  reportDeprecatedFeatureUsage({
    log,
    deprecation,
  })
}
