/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeepPrimitiveMap } from "../../../config/common.js"
import { createSchema, joi, joiIdentifier, joiPrimitive, joiSparseArray } from "../../../config/common.js"
import type { KubernetesCommonRunSpec, KubernetesTargetResourceSpec, PortForwardSpec } from "../config.js"
import {
  kubernetesCommonRunSchemaKeys,
  namespaceNameSchema,
  portForwardsSchema,
  runPodResourceSchema,
  targetResourceSpecSchema,
} from "../config.js"
import type { KubernetesDeploySyncSpec } from "../sync.js"
import { kubernetesDeploySyncSchema } from "../sync.js"
import type { DeployAction, DeployActionConfig } from "../../../actions/deploy.js"
import { dedent, deline } from "../../../util/string.js"
import type { RunAction, RunActionConfig } from "../../../actions/run.js"
import type { TestAction, TestActionConfig } from "../../../actions/test.js"
import type { ObjectSchema } from "@hapi/joi"
import type { KubernetesRunOutputs } from "../kubernetes-type/config.js"
import type { ActionKind } from "../../../plugin/action-types.js"

// DEPLOY //

export const defaultHelmTimeout = 300
export const defaultHelmRepo = "https://charts.helm.sh/stable"

interface HelmChartSpec {
  name?: string // Formerly `chart` on Helm modules
  path?: string // Formerly `chartPath`
  repo?: string
  url?: string
  version?: string
}

interface HelmDeployActionSpec {
  atomic: boolean
  waitForUnhealthyResources: boolean
  chart?: HelmChartSpec
  defaultTarget?: KubernetesTargetResourceSpec
  sync?: KubernetesDeploySyncSpec
  namespace?: string
  portForwards?: PortForwardSpec[]
  releaseName?: string
  values: DeepPrimitiveMap
  valueFiles: string[]
}

const parameterValueSchema = () =>
  joi
    .alternatives(
      joiPrimitive(),
      joi.array().items(joi.link("#parameterValue")),
      joi.object().pattern(/.+/, joi.link("#parameterValue"))
    )
    .id("parameterValue")

const helmReleaseNameSchema = () =>
  joiIdentifier().description(
    "Optionally override the release name used when installing (defaults to the Deploy name)."
  )

const helmValuesSchema = () =>
  joi
    .object()
    .pattern(/.+/, parameterValueSchema())
    .default(() => ({})).description(deline`
    Map of values to pass to Helm when rendering the templates. May include arrays and nested objects.
    When specified, these take precedence over the values in the \`values.yaml\` file (or the files specified
    in \`valueFiles\`).
  `)

const helmValueFilesSchema = () =>
  joiSparseArray(joi.posixPath()).description(dedent`
    Specify value files to use when rendering the Helm chart. These will take precedence over the \`values.yaml\` file
    bundled in the Helm chart, and should be specified in ascending order of precedence. Meaning, the last file in
    this list will have the highest precedence.

    If you _also_ specify keys under the \`values\` field, those will effectively be added as another file at the end
    of this list, so they will take precedence over other files listed here.

    Note that the paths here should be relative to the _config_ root, and the files should be contained in
    this action config's directory.
  `)

export const helmCommonSchemaKeys = () => ({
  namespace: namespaceNameSchema(),
  portForwards: portForwardsSchema(),
  releaseName: helmReleaseNameSchema(),
  timeout: joi
    .number()
    .integer()
    .default(defaultHelmTimeout)
    .description(
      "Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks)."
    ),
  values: helmValuesSchema(),
  valueFiles: helmValueFilesSchema(),
})

export const helmChartNameSchema = () =>
  joi
    .string()
    .description(
      "A valid Helm chart name or URI (same as you'd input to `helm install`) Required if the action doesn't contain the Helm chart itself."
    )
    .example("ingress-nginx")

export const helmChartRepoSchema = () =>
  joi
    .string()
    .description(`The repository URL to fetch the chart from. Defaults to the "stable" helm repo (${defaultHelmRepo}).`)
export const helmChartVersionSchema = () => joi.string().description("The chart version to deploy.")

export const defaultTargetSchema = () =>
  targetResourceSpecSchema().description(
    dedent`
    Specify a default resource in the deployment to use for syncs, local mode, and for the \`garden exec\` command.

    Specify either \`kind\` and \`name\`, or a \`podSelector\`. The resource should be one of the resources deployed by this action (otherwise the target is not guaranteed to be deployed with adjustments required for syncing or local mode).

    Set \`containerName\` to specify a container to connect to in the remote Pod. By default the first container in the Pod is used.

    Note that if you specify \`podSelector\` here, it is not validated to be a selector matching one of the resources deployed by the action.
    `
  )

const helmChartSpecSchema = () =>
  joi
    .object()
    .keys({
      name: helmChartNameSchema(),
      path: joi
        .posixPath()
        .subPathOnly()
        .description(
          "The path, relative to the action path, to the chart sources (i.e. where the Chart.yaml file is, if any)."
        ),
      repo: helmChartRepoSchema(),
      url: joi.string().uri().description("URL to OCI repository, or a URL to a packaged Helm chart archive."),
      version: helmChartVersionSchema(),
    })
    .without("path", ["name", "repo", "version", "url"])
    .without("url", ["name", "repo", "path"])
    .xor("name", "path", "url")
    .description(
      dedent`
  Specify the Helm chart to use.

  If the chart is defined in the same directory as the action, you can skip this, and the chart sources will be detected. If the chart is in the source tree but in a sub-directory, you should set \`chart.path\` to the directory path, relative to the action directory.

  For remote charts, there are multiple options:
  - **[Helm Chart repository](https://helm.sh/docs/topics/chart_repository/)**: specify \`chart.name\` and \`chart.version\, and optionally \`chart.repo\` (if the chart is not in the default "stable" repo).
  - **[OCI-Based Registry](https://helm.sh/docs/topics/registries/)**: specify \`chart.url\` with the \`oci://\` URL and optionally \`chart.version\`.
  - **Absolute URL to a packaged chart**: specify \`chart.url\`.

  One of \`chart.name\`, \`chart.path\` or \`chart.url\` must be specified.
  `
    )

export const defaultHelmAtomicFlag = false
export const defaultHelmAtomicFlagDesc = dedent`
  Whether to set the \`--atomic\` flag during installs and upgrades. Set to \`true\` if you'd like the changes applied
  to be reverted on failure. Set to false if e.g. you want to see more information about failures and then manually
  roll back, instead of having Helm do it automatically on failure.

  Note that setting \`atomic\` to \`true\` implies \`wait\`.
`

export const helmDeploySchema = () =>
  joi
    .object()
    .keys({
      ...helmCommonSchemaKeys(),
      atomic: joi.boolean().default(defaultHelmAtomicFlag).description(defaultHelmAtomicFlagDesc),
      waitForUnhealthyResources: joi.boolean().default(false).description(dedent`
        Whether to wait for the Helm command to complete before throwing an error if one of the resources being installed/upgraded is unhealthy.

        By default, Garden will monitor the resources being created by Helm and throw an error as soon as one of them is unhealthy. This allows Garden to fail fast if there's an issue with one of the resources. If no issue is detected, Garden waits for the Helm command to complete.

        If however \`waitForUnhealthyResources\` is set to \`true\` and some resources are unhealthy, then Garden will wait for Helm itself to throw an error which typically happens when it times out in the case of unhealthy resources (e.g. due to \`ImagePullBackOff\` or \`CrashLoopBackOff\` errors).

        Waiting for the timeout can take awhile so using the default value here is recommended unless you'd like to completely mimic Helm's behaviour and not rely on Garden's resource monitoring.

        Note that setting \`atomic\` to \`true\` implies \`waitForUnhealthyResources\`.
      `),
      chart: helmChartSpecSchema(),
      defaultTarget: defaultTargetSchema(),
      sync: kubernetesDeploySyncSchema(),
    })
    .rename("devMode", "sync")

export type HelmDeployConfig = DeployActionConfig<"helm", HelmDeployActionSpec>
export type HelmDeployAction = DeployAction<HelmDeployConfig, {}>

// RUN & TEST //

export interface HelmPodRunActionSpec extends KubernetesCommonRunSpec {
  chart?: HelmChartSpec
  namespace?: string
  releaseName?: string
  values: DeepPrimitiveMap
  valueFiles: string[]
  resource?: KubernetesTargetResourceSpec
}

// Maintaining this cache to avoid errors when `kubernetesRunPodSchema` is called more than once with the same `kind`.
const runSchemas: { [name: string]: ObjectSchema } = {}

export const helmPodRunSchema = (kind: ActionKind) => {
  const name = `${kind}:helm-pod`
  if (runSchemas[name]) {
    return runSchemas[name]
  }
  const schema = createSchema({
    name: `${kind}:helm-pod`,
    keys: () => ({
      ...kubernetesCommonRunSchemaKeys(kind),
      releaseName: helmReleaseNameSchema().description(
        `Optionally override the release name used when rendering the templates (defaults to the ${kind} name).`
      ),
      chart: helmChartSpecSchema(),
      values: helmValuesSchema(),
      valueFiles: helmValueFilesSchema(),
      resource: runPodResourceSchema(kind),
      timeout: joi
        .number()
        .integer()
        .default(defaultHelmTimeout)
        .description("Time in seconds to wait for Helm to render templates."),
    }),
    xor: [["resource", "podSpec"]],
  })()
  runSchemas[name] = schema
  return schema
}

export type HelmPodRunConfig = RunActionConfig<"helm-pod", HelmPodRunActionSpec>
export type HelmPodRunAction = RunAction<HelmPodRunConfig, KubernetesRunOutputs>

export type HelmPodTestActionSpec = HelmPodRunActionSpec

export type HelmPodTestConfig = TestActionConfig<"helm-pod", HelmPodTestActionSpec>
export type HelmPodTestAction = TestAction<HelmPodTestConfig, KubernetesRunOutputs>

export type HelmActionConfig = HelmDeployConfig | HelmPodRunConfig | HelmPodTestConfig
