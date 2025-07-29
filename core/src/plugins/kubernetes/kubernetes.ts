/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "../../plugin/plugin.js"
import { helmModuleHandlers } from "./helm/handlers.js"
import { getAppNamespace, getSystemNamespace } from "./namespace.js"
import { cleanupEnvironment, getEnvironmentStatus, prepareEnvironment } from "./init.js"
import { containerHandlers } from "./container/handlers.js"
import { kubernetesHandlers } from "./kubernetes-type/handlers.js"
import type { ConfigureProviderParams } from "../../plugin/handlers/Provider/configureProvider.js"
import type { DebugInfo, GetDebugInfoParams } from "../../plugin/handlers/Provider/getDebugInfo.js"
import { kubectl, kubectlSpec } from "./kubectl.js"
import type { KubernetesConfig, KubernetesPluginContext } from "./config.js"
import { configSchema } from "./config.js"
import { cleanupClusterRegistry } from "./commands/cleanup-cluster-registry.js"
import { pullImage } from "./commands/pull-image.js"
import { uninstallGardenServices } from "./commands/uninstall-garden-services.js"
import { joi, joiIdentifier } from "../../config/common.js"
import { resolve } from "path"
import { dedent } from "../../util/string.js"
import { kubernetesModuleSpecSchema } from "./kubernetes-type/module-config.js"
import { helmModuleOutputsSchema, helmModuleSpecSchema } from "./helm/module-config.js"
import { defaultIngressClass } from "./constants.js"
import { helmSpec } from "./helm/helm-cli.js"
import { isString } from "lodash-es"
import { mutagenCliSpec } from "../../mutagen.js"
import {
  k8sContainerBuildExtension,
  k8sContainerDeployExtension,
  k8sContainerRunExtension,
  k8sContainerTestExtension,
} from "./container/extensions.js"
import { getHelmDeployDocs, helmDeployDefinition } from "./helm/action.js"
import { jibContainerHandlers, k8sJibContainerBuildExtension } from "./jib-container.js"
import { kubernetesDeployDefinition, kubernetesDeployDocs } from "./kubernetes-type/deploy.js"
import { kustomize4Spec, kustomize5Spec } from "./kubernetes-type/kustomize.js"
import { syncPause, syncResume, syncStatus } from "./commands/sync.js"
import { helmPodRunDefinition, helmPodTestDefinition } from "./helm/helm-pod.js"
import { kubernetesPodRunDefinition, kubernetesPodTestDefinition } from "./kubernetes-type/kubernetes-pod.js"
import { kubernetesExecRunDefinition, kubernetesExecTestDefinition } from "./kubernetes-type/kubernetes-exec.js"
import { makeDocsLinkPlain, makeDocsLinkStyled } from "../../docs/common.js"
import { cleanupUtilDeployment } from "./commands/cleanup-garden-util.js"
import { reportDeprecatedFeatureUsage } from "../../util/deprecations.js"
import { pauseCommand } from "./commands/pause.js"
import { keepAliveCommand } from "./commands/keep-alive.js"

export const CONTAINER_BUILD_CONCURRENCY_LIMIT_REMOTE_KUBERNETES = 5
export const CONTAINER_STATUS_CONCURRENCY_LIMIT_REMOTE_KUBERNETES = 20

export async function configureProvider({
  namespace,
  projectName,
  projectRoot,
  config,
  log,
}: ConfigureProviderParams<KubernetesConfig>) {
  if ("sync" in config.resources) {
    reportDeprecatedFeatureUsage({ deprecation: "kubernetesProviderSyncResourceLimit", log })
  }

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
    log.warn(dedent`
      You are using a remote Kubernetes cluster and did not configure a 'deploymentRegistry' in the kubernetes provider section of the project configuration.

      For guidance in setting up remote Kubernetes clusters please refer to ${makeDocsLinkStyled("kubernetes-plugins/remote-k8s")}
    `)
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
    The \`kubernetes\` provider adds the [\`helm\`](${makeDocsLinkPlain`garden-for/kubernetes/install-helm-chart`}) and
    [\`kubernetes\`](${makeDocsLinkPlain("garden-for/kubernetes/deploy-k8s-resource")}) action types.

    For usage information, please refer to the [guides section](../../guides). A good place to start is
    the [Remote Kubernetes guide](${makeDocsLinkPlain`garden-for/kubernetes/remote-kubernetes`}) guide if you're connecting to remote clusters.
    The [Quickstart guide](${makeDocsLinkPlain`getting-started/quickstart`}) guide is also helpful as an introduction.

    Note that if you're using a local Kubernetes cluster (e.g. minikube or Docker Desktop), the [local-kubernetes provider](./local-kubernetes.md) simplifies (and automates) the configuration and setup quite a bit.

    Please note that Garden is committed to supporting [the _latest officially supported_ versions](https://kubernetes.io/releases/).
    The information on the Kubernetes support and EOL timelines can be found [here](https://endoflife.date/kubernetes).
  `,
    configSchema: configSchema(),
    outputsSchema,
    commands: [
      cleanupClusterRegistry,
      cleanupUtilDeployment,
      uninstallGardenServices,
      pauseCommand,
      keepAliveCommand,
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
      Deploy: [kubernetesDeployDefinition(), helmDeployDefinition()],
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
    tools: [kubectlSpec, kustomize4Spec, kustomize5Spec, helmSpec, mutagenCliSpec],
  })
}
