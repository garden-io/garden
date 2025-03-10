/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, joiSparseArray } from "../../../config/common.js"
import type { KubernetesTargetResourceSpec, PortForwardSpec } from "../config.js"
import { k8sDeploymentTimeoutSchema, namespaceNameSchema, portForwardsSchema } from "../config.js"
import type { KubernetesDeploySyncSpec } from "../sync.js"
import { kubernetesDeploySyncSchema } from "../sync.js"
import type { KubernetesKustomizeSpec } from "./kustomize.js"
import { kustomizeSpecSchema } from "./kustomize.js"
import type { KubernetesPatchResource, KubernetesResource } from "../types.js"
import type { DeployAction, DeployActionConfig } from "../../../actions/deploy.js"
import { defaultTargetSchema } from "../helm/config.js"
import type {
  KubernetesPodRunAction,
  KubernetesPodRunActionConfig,
  KubernetesPodTestAction,
  KubernetesPodTestActionConfig,
} from "./kubernetes-pod.js"
import type { KubernetesLocalModeSpec } from "../local-mode.js"
import { kubernetesLocalModeSchema } from "../local-mode.js"
import type { ContainerRunOutputs } from "../../container/config.js"
import { containerRunOutputSchema } from "../../container/config.js"
import type {
  KubernetesExecRunAction,
  KubernetesExecRunActionConfig,
  KubernetesExecTestAction,
  KubernetesExecTestActionConfig,
} from "./kubernetes-exec.js"
import { dedent } from "../../../util/string.js"
import type { ApplyParams } from "../kubectl.js"
import { getProjectApiVersion } from "../../../project-api-version.js"
import { GardenApiVersion } from "../../../constants.js"
import type { Log } from "../../../logger/log-entry.js"
import { reportDefaultConfigValueChange } from "../../../util/deprecations.js"

export interface KubernetesTypeCommonDeploySpec {
  files: string[]
  kustomize?: KubernetesKustomizeSpec
  patchResources?: KubernetesPatchResource[]
  manifests: KubernetesResource[]
  namespace?: string
  portForwards?: PortForwardSpec[]
  applyArgs?: ApplyParams["applyArgs"]
}

export interface KubernetesDeployActionSpec extends KubernetesTypeCommonDeploySpec {
  defaultTarget?: KubernetesTargetResourceSpec
  sync?: KubernetesDeploySyncSpec
  localMode?: KubernetesLocalModeSpec
  // TODO(0.14) make this non-optional with schema-level default values
  waitForJobs?: boolean
}

export function getDefaultWaitForJobs() {
  const projectApiVersion = getProjectApiVersion()
  const defaultValue = projectApiVersion === GardenApiVersion.v2
  return { projectApiVersion, defaultValue }
}

export function getWaitForJobs({ waitForJobs, log }: { waitForJobs: boolean | undefined; log: Log }): boolean {
  const { projectApiVersion, defaultValue } = getDefaultWaitForJobs()
  if (waitForJobs === undefined) {
    reportDefaultConfigValueChange({ apiVersion: projectApiVersion, log, deprecation: "waitForJobs" })
  }

  return waitForJobs ?? defaultValue
}

export type KubernetesDeployActionConfig = DeployActionConfig<"kubernetes", KubernetesDeployActionSpec>
export type KubernetesDeployAction = DeployAction<KubernetesDeployActionConfig>

const kubernetesResourceSchema = () =>
  joi
    .object()
    .keys({
      apiVersion: joi.string().required().description("The API version of the resource."),
      kind: joi.string().required().description("The kind of the resource."),
      metadata: joi
        .object()
        .required()
        .keys({
          name: joi.string().required().description("The name of the resource."),
        })
        .unknown(true),
    })
    .unknown(true)

const kubernetesPatchResourceSchema = () =>
  joi.object().keys({
    kind: joi.string().required().description("The kind of the resource to patch."),
    name: joi.string().required().description("The name of the resource to patch."),
    strategy: joi
      .string()
      .allow("json", "merge", "strategic")
      .required()
      .description(
        dedent`
        The patch strategy to use. One of 'json', 'merge', or 'strategic'. Defaults to 'strategic'.

        You can read more about the different strategies in the offical Kubernetes documentation at:
        https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/
        `
      )
      .default("strategic")
      .optional(),
    patch: joi.object().required().description("The patch to apply.").unknown(true),
  })

export const kubernetesFilesSchema = () =>
  joiSparseArray(joi.posixPath().subPathOnly().allowGlobs()).description(
    "POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before applying the manifests."
  )

export const kubernetesManifestsSchema = () =>
  joiSparseArray(kubernetesResourceSchema()).description(
    "List of Kubernetes resource manifests to deploy. If `files` is also specified, this is combined with the manifests read from the files."
  )

export const kubernetesPatchResourcesSchema = () =>
  joiSparseArray(kubernetesPatchResourceSchema()).description(
    dedent`
      A list of resources to patch using Kubernetes' patch strategies. This is useful for e.g. overwriting a given container image name with an image built by Garden
      without having to actually modify the underlying Kubernetes manifest in your source code. Another common example is to use this to change the number of replicas for a given
      Kubernetes Deployment.

      Under the hood, Garden just applies the \`kubectl patch\` command to the resource that matches the specified \`kind\` and \`name\`.

      Patches are applied to file manifests, inline manifests, and kustomize files.

      You can learn more about patching Kubernetes resources here: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/
    `
  )

export const kubernetesApplyArgsSchema = () =>
  joi.sparseArray().items(joi.string()).description("Additional arguments to pass to `kubectl apply`.")

export const kubernetesCommonDeploySpecKeys = () => ({
  files: kubernetesFilesSchema(),
  kustomize: kustomizeSpecSchema(),
  manifests: kubernetesManifestsSchema(),
  patchResources: kubernetesPatchResourcesSchema(),
  namespace: namespaceNameSchema(),
  portForwards: portForwardsSchema(),
  timeout: k8sDeploymentTimeoutSchema(),
  applyArgs: kubernetesApplyArgsSchema(),
  // TODO-0.14: flip this to true and change default behavior to wait for the jobs
  waitForJobs: joi
    .boolean()
    .optional()
    // .default(false)
    .description("Wait until the jobs have been completed. Garden will wait for as long as `timeout`."),
})

export const kubernetesDeploySchema = () =>
  joi
    .object()
    .keys({
      ...kubernetesCommonDeploySpecKeys(),
      defaultTarget: defaultTargetSchema(),
      sync: kubernetesDeploySyncSchema(),
      localMode: kubernetesLocalModeSchema(),
    })
    .rename("devMode", "sync")

export type KubernetesRunOutputs = ContainerRunOutputs

export const kubernetesRunOutputsSchema = () => containerRunOutputSchema()

export type KubernetesRunActionConfig = KubernetesPodRunActionConfig | KubernetesExecRunActionConfig
export type KubernetesRunAction = KubernetesPodRunAction | KubernetesExecRunAction

export type KubernetesTestOutputs = KubernetesRunOutputs

export const kubernetesTestOutputsSchema = () => kubernetesRunOutputsSchema()

export type KubernetesTestActionConfig = KubernetesPodTestActionConfig | KubernetesExecTestActionConfig
export type KubernetesTestAction = KubernetesPodTestAction | KubernetesExecTestAction

export type KubernetesActionConfig =
  | KubernetesDeployActionConfig
  | KubernetesRunActionConfig
  | KubernetesTestActionConfig
