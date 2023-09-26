/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "../../plugin/plugin"
import { helmModuleHandlers } from "./helm/handlers"
import { getAppNamespace, getSystemNamespace } from "./namespace"
import { getEnvironmentStatus, prepareEnvironment, cleanupEnvironment } from "./init"
import { containerHandlers } from "./container/handlers"
import { kubernetesHandlers } from "./kubernetes-type/handlers"
import { ConfigureProviderParams } from "../../plugin/handlers/Provider/configureProvider"
import { DebugInfo, GetDebugInfoParams } from "../../plugin/handlers/Provider/getDebugInfo"
import { kubectl, kubectlSpec } from "./kubectl"
import { KubernetesConfig, KubernetesPluginContext } from "./config"
import { configSchema } from "./config"
import { ConfigurationError } from "../../exceptions"
import { cleanupClusterRegistry } from "./commands/cleanup-cluster-registry"
import { clusterInit } from "./commands/cluster-init"
import { pullImage } from "./commands/pull-image"
import { uninstallGardenServices } from "./commands/uninstall-garden-services"
import { joi, joiIdentifier } from "../../config/common"
import { resolve } from "path"
import { dedent } from "../../util/string"
import { kubernetesModuleSpecSchema } from "./kubernetes-type/module-config"
import { helmModuleSpecSchema, helmModuleOutputsSchema } from "./helm/module-config"
import { defaultIngressClass } from "./constants"
import { pvcModuleDefinition, persistentvolumeclaimDeployDefinition } from "./volumes/persistentvolumeclaim"
import { helm3Spec } from "./helm/helm-cli"
import { isString } from "lodash"
import { mutagenCliSpec } from "../../mutagen"
import { configMapModuleDefinition, configmapDeployDefinition } from "./volumes/configmap"
import {
  k8sContainerBuildExtension,
  k8sContainerDeployExtension,
  k8sContainerRunExtension,
  k8sContainerTestExtension,
} from "./container/extensions"
import { helmDeployDefinition, getHelmDeployDocs } from "./helm/action"
import { k8sJibContainerBuildExtension, jibContainerHandlers } from "./jib-container"
import { kubernetesDeployDefinition, kubernetesDeployDocs } from "./kubernetes-type/deploy"
import { kustomizeSpec } from "./kubernetes-type/kustomize"
import { syncPause, syncResume, syncStatus } from "./commands/sync"
import { helmPodRunDefinition, helmPodTestDefinition } from "./helm/helm-pod"
import { kubernetesPodRunDefinition, kubernetesPodTestDefinition } from "./kubernetes-type/kubernetes-pod"
import { kubernetesExecRunDefinition, kubernetesExecTestDefinition } from "./kubernetes-type/kubernetes-exec"
import { makeDocsLink } from "../../docs/common"
import { DOCS_BASE_URL } from "../../constants"

export async function configureProvider({
  namespace,
  projectName,
  projectRoot,
  config,
}: ConfigureProviderParams<KubernetesConfig>) {
  // Convert string shorthand to canonical format
  if (isString(config.namespace)) {
    config.namespace = { name: config.namespace }
  }

  if (!config.namespace) {
    config.namespace = { name: `${projectName}-${namespace}` }
  }

  if (config.setupIngressController === "nginx") {
    if (!config.ingressClass) {
      config.ingressClass = defaultIngressClass
    }
  }

  if (config.name !== "local-kubernetes" && !config.deploymentRegistry) {
    const remoteK8sDocs = `${DOCS_BASE_URL}/kubernetes-plugins/remote-k8s`
    throw new ConfigurationError({
      message: dedent`
        Configuring a 'deploymentRegistry' in the kubernetes provider section of the project configuration is required when working with remote Kubernetes clusters.

        See also ${remoteK8sDocs}`,
    })
  }

  if (config.kubeconfig) {
    config.kubeconfig = resolve(projectRoot, config.kubeconfig)
  }

  return { config }
}

export async function debugInfo({ ctx, log, includeProject }: GetDebugInfoParams): Promise<DebugInfo> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const providerLog = log
    .createLog({ name: ctx.provider.name, showDuration: true })
    .info("collecting provider configuration")

  const systemNamespace = await getSystemNamespace(k8sCtx, provider, log)

  const namespacesList = [systemNamespace]
  if (includeProject) {
    const appNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    namespacesList.push(appNamespace)
  }
  const namespaces = await Promise.all(
    namespacesList.map(async (ns) => {
      const nsLog = providerLog.createLog({ name: ns, showDuration: true }).info("collecting namespace configuration")
      const out = await kubectl(ctx, provider).stdout({
        log,
        args: ["get", "all", "--namespace", ns, "--output", "json"],
      })
      nsLog.success(`Done`)
      return {
        namespace: ns,
        output: JSON.parse(out),
      }
    })
  )
  providerLog.success(`Done`)

  const version = await kubectl(ctx, provider).stdout({ log, args: ["version", "--output", "json"] })

  return {
    info: { version: JSON.parse(version), namespaces },
  }
}

const outputsSchema = joi.object().keys({
  "app-namespace": joiIdentifier().required().description("The primary namespace used for resource deployments."),
  "default-hostname": joi.string().description("The default hostname configured on the provider."),
})

export const gardenPlugin = () => {
  return createGardenPlugin({
    name: "kubernetes",
    dependencies: [{ name: "container" }, { name: "jib", optional: true }],
    docs: dedent`
    The \`kubernetes\` provider allows you to deploy [\`container\` actions](${makeDocsLink(
      "k8s-plugins/action-types/container"
    )}) to
    Kubernetes clusters, and adds the [\`helm\`](${makeDocsLink`k8s-plugins/action-types/helm`}) and
    [\`kubernetes\`](${makeDocsLink("k8s-plugins/action-types/kubernetes")}) action types.

    For usage information, please refer to the [guides section](../../guides). A good place to start is
    the [Remote Kubernetes guide](${makeDocsLink`k8s-plugins/remote-k8s/README`}) guide if you're connecting to remote clusters.
    The [Quickstart guide](${makeDocsLink`getting-started/quickstart`}) guide is also helpful as an introduction.

    Note that if you're using a local Kubernetes cluster (e.g. minikube or Docker Desktop), the [local-kubernetes provider](./local-kubernetes.md) simplifies (and automates) the configuration and setup quite a bit.
  `,
    configSchema: configSchema(),
    outputsSchema,
    commands: [
      cleanupClusterRegistry,
      clusterInit,
      uninstallGardenServices,
      pullImage,
      syncStatus,
      syncPause,
      syncResume,
    ],
    handlers: {
      configureProvider,
      getEnvironmentStatus,
      prepareEnvironment,
      cleanupEnvironment,
      getDebugInfo: debugInfo,
    },

    createActionTypes: {
      Deploy: [
        kubernetesDeployDefinition(),
        helmDeployDefinition(),
        configmapDeployDefinition(),
        persistentvolumeclaimDeployDefinition(),
      ],
      Run: [kubernetesExecRunDefinition(), kubernetesPodRunDefinition(), helmPodRunDefinition()],
      Test: [kubernetesExecTestDefinition(), kubernetesPodTestDefinition(), helmPodTestDefinition()],
    },

    extendActionTypes: {
      Build: [k8sContainerBuildExtension(), k8sJibContainerBuildExtension()],
      Deploy: [k8sContainerDeployExtension()],
      Run: [k8sContainerRunExtension()],
      Test: [k8sContainerTestExtension()],
    },

    createModuleTypes: [
      {
        name: "helm",
        docs: getHelmDeployDocs(),
        moduleOutputsSchema: helmModuleOutputsSchema(),
        schema: helmModuleSpecSchema(),
        handlers: helmModuleHandlers,
        needsBuild: false,
      },
      {
        name: "kubernetes",
        docs: kubernetesDeployDocs,
        moduleOutputsSchema: joi.object().keys({}),
        schema: kubernetesModuleSpecSchema(),
        handlers: kubernetesHandlers,
        needsBuild: false,
      },
      pvcModuleDefinition(),
      configMapModuleDefinition(),
    ],

    extendModuleTypes: [
      {
        name: "container",
        handlers: containerHandlers,
        needsBuild: true,
      },
      // For now we need to explicitly support descendant module types
      {
        name: "jib-container",
        handlers: jibContainerHandlers,
        needsBuild: true,
      },
    ],
    tools: [kubectlSpec, kustomizeSpec, helm3Spec, mutagenCliSpec],
  })
}
