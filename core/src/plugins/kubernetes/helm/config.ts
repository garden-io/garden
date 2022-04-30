/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeepPrimitiveMap, joi, joiIdentifier, joiPrimitive, joiSparseArray } from "../../../config/common"
import { namespaceNameSchema, PortForwardSpec, portForwardsSchema } from "../config"
import { KubernetesDeployDevModeSpec } from "../dev-mode"
import { DeployAction, DeployActionConfig } from "../../../actions/deploy"
import { dedent, deline } from "../../../util/string"

// DEPLOY //

export const defaultHelmTimeout = 300
export const defaultHelmRepo = "https://charts.helm.sh/stable"

interface HelmDeployActionSpec {
  atomicInstall: boolean
  chart?: {
    name?: string // Formerly `chart` on Helm modules
    path?: string // Formerly `chartPath`
    repo?: string // Formerly `repo`
    version?: string // Formerly `version`
  }
  devMode?: KubernetesDeployDevModeSpec
  namespace?: string
  portForwards?: PortForwardSpec[]
  releaseName?: string
  timeout: number
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

export const helmCommonSchemaKeys = () => ({
  atomicInstall: joi
    .boolean()
    .default(true)
    .description(
      "Whether to set the --atomic flag during installs and upgrades. Set to false if e.g. you want to see more information about failures and then manually roll back, instead of having Helm do it automatically on failure."
    ),
  namespace: namespaceNameSchema(),
  portForwards: portForwardsSchema(),
  releaseName: joiIdentifier().description(
    "Optionally override the release name used when installing (defaults to the module name)."
  ),
  timeout: joi
    .number()
    .integer()
    .default(defaultHelmTimeout)
    .description(
      "Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks)."
    ),
  values: joi
    .object()
    .pattern(/.+/, parameterValueSchema())
    .default(() => ({})).description(deline`
      Map of values to pass to Helm when rendering the templates. May include arrays and nested objects.
      When specified, these take precedence over the values in the \`values.yaml\` file (or the files specified
      in \`valueFiles\`).
    `),
  valueFiles: joiSparseArray(joi.posixPath().subPathOnly()).description(dedent`
      Specify value files to use when rendering the Helm chart. These will take precedence over the \`values.yaml\` file
      bundled in the Helm chart, and should be specified in ascending order of precedence. Meaning, the last file in
      this list will have the highest precedence.

      If you _also_ specify keys under the \`values\` field, those will effectively be added as another file at the end
      of this list, so they will take precedence over other files listed here.

      Note that the paths here should be relative to the _module_ root, and the files should be contained in
      your module directory.
    `),
})

export const helmChartNameSchema = () =>
  joi
    .string()
    .description(
      "A valid Helm chart name or URI (same as you'd input to `helm install`) Required if the module doesn't contain the Helm chart itself."
    )
    .example("ingress-nginx")

export const helmChartRepoSchema = () =>
  joi
    .string()
    .description(`The repository URL to fetch the chart from. Defaults to the "stable" helm repo (${defaultHelmRepo}).`)
export const helmChartVersionSchema = () => joi.string().description("The chart version to deploy.")

export const helmDeploySchema = () =>
  joi.object().keys({
    ...helmCommonSchemaKeys(),
    chart: joi
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
        version: helmChartVersionSchema(),
      })
      .with("name", ["version"])
      .without("path", ["name", "repo", "version"])
      .description(
        dedent`
        Specify the Helm chart to deploy.

        If the chart is defined in the same directory as the action, you can skip this, and the chart sources will be detected. If the chart is in the source tree but in a sub-directory, you should set \`chart.path\` to the directory path, relative to the action directory.

        If the chart is remote, you must specify \`chart.name\` and \`chart.version\, and optionally \`chart.repo\` (if the chart is not in the default "stable" repo).
        `
      ),
  })

export type HelmDeployConfig = DeployActionConfig<"helm", HelmDeployActionSpec>
export type HelmDeployAction = DeployAction<HelmDeployConfig, {}>

// NOTE: Runs and Tests are handled as `kubernetes` Run and Test actions

export type HelmActionConfig = HelmDeployConfig
