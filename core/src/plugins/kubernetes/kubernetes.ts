/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"

import { createGardenPlugin } from "../../plugin/plugin"
import { helmModuleHandlers } from "./helm/handlers"
import { getAppNamespace, getSystemNamespace } from "./namespace"
import { getEnvironmentStatus, prepareEnvironment, cleanupEnvironment } from "./init"
import { containerHandlers } from "./container/handlers"
import { kubernetesHandlers } from "./kubernetes-type/handlers"
import { ConfigureProviderParams } from "../../plugin/handlers/provider/configureProvider"
import { DebugInfo, GetDebugInfoParams } from "../../plugin/handlers/provider/getDebugInfo"
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
import chalk from "chalk"
import pluralize from "pluralize"
import { getSystemMetadataNamespaceName } from "./system"
import { DOCS_BASE_URL } from "../../constants"
import { defaultIngressClass } from "./constants"
import { pvcModuleDefinition } from "./volumes/persistentvolumeclaim"
import { helm3Spec } from "./helm/helm-cli"
import { isString } from "lodash"
import { mutagenCliSpec } from "./mutagen"
import { configMapModuleDefinition } from "./volumes/configmap"
import {
  k8sContainerBuildExtension,
  k8sContainerDeployExtension,
  k8sContainerRunExtension,
  k8sContainerTestExtension,
} from "./container/extensions"
import { helmDeployDefinition, helmDeployDocs } from "./helm/action"
import { k8sJibContainerBuildExtension, jibContainerHandlers } from "./jib-container"
import { kubernetesDeployDefinition, kubernetesDeployDocs } from "./kubernetes-type/deploy"
import { kustomizeSpec } from "./kubernetes-type/kustomize"
import { kubernetesRunDefinition } from "./kubernetes-type/run"
import { kubernetesTestDefinition } from "./kubernetes-type/test"

export async function configureProvider({
  namespace,
  projectName,
  projectRoot,
  config,
}: ConfigureProviderParams<KubernetesConfig>) {
  config._systemServices = []

  // Convert string shorthand to canonical format
  if (isString(config.namespace)) {
    config.namespace = { name: config.namespace }
  }

  if (!config.namespace) {
    config.namespace = { name: `${projectName}-${namespace}` }
  }

  if (config.setupIngressController === "nginx") {
    config._systemServices.push("ingress-controller", "default-backend")

    if (!config.ingressClass) {
      config.ingressClass = defaultIngressClass
    }
  }

  if (config.name !== "local-kubernetes" && !config.deploymentRegistry) {
    throw new ConfigurationError(`kubernetes: must specify deploymentRegistry in config`, {
      config,
    })
  }

  if (config.kubeconfig) {
    config.kubeconfig = resolve(projectRoot, config.kubeconfig)
  }

  const managedCertificates = config.tlsCertificates.filter((cert) => cert.managedBy === "cert-manager")
  if (managedCertificates.length > 0 && !config.certManager) {
    throw new ConfigurationError(
      `cert-manager: found ${managedCertificates.length} ${pluralize(
        "certificate",
        managedCertificates.length
      )} managed by cert-manager but no certManager configuration.`,
      { config }
    )
  }

  return { config }
}

export async function debugInfo({ ctx, log, includeProject }: GetDebugInfoParams): Promise<DebugInfo> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const entry = log.info({ section: ctx.provider.name, msg: "collecting provider configuration", status: "active" })

  const systemNamespace = await getSystemNamespace(ctx, provider, log)
  const systemMetadataNamespace = getSystemMetadataNamespaceName(provider.config)

  const namespacesList = [systemNamespace, systemMetadataNamespace]
  if (includeProject) {
    const appNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    namespacesList.push(appNamespace)
  }
  const namespaces = await Bluebird.map(namespacesList, async (ns) => {
    const nsEntry = entry.info({ section: ns, msg: "collecting namespace configuration", status: "active" })
    const out = await kubectl(ctx, provider).stdout({
      log,
      args: ["get", "all", "--namespace", ns, "--output", "json"],
    })
    nsEntry.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })
    return {
      namespace: ns,
      output: JSON.parse(out),
    }
  })
  entry.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })

  const version = await kubectl(ctx, provider).stdout({ log, args: ["version", "--output", "json"] })

  return {
    info: { version: JSON.parse(version), namespaces },
  }
}

const outputsSchema = joi.object().keys({
  "app-namespace": joiIdentifier().required().description("The primary namespace used for resource deployments."),
  "default-hostname": joi.string().description("The default hostname configured on the provider."),
})

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "kubernetes",
    dependencies: [{ name: "container" }, { name: "jib", optional: true }],
    docs: dedent`
    The \`kubernetes\` provider allows you to deploy [\`container\` modules](../module-types/container.md) to
    Kubernetes clusters, and adds the [\`helm\`](../module-types/helm.md) and
    [\`kubernetes\`](../module-types/kubernetes.md) module types.

    For usage information, please refer to the [guides section](${DOCS_BASE_URL}/guides). A good place to start is
    the [Remote Kubernetes guide](../../k8s-plugins/remote-k8s/README.md) guide if you're connecting to remote clusters.
    The [Quickstart guide](../../basics/quickstart.md) guide is also helpful as an introduction.

    Note that if you're using a local Kubernetes cluster (e.g. minikube or Docker Desktop), the [local-kubernetes provider](./local-kubernetes.md) simplifies (and automates) the configuration and setup quite a bit.
  `,
    configSchema: configSchema(),
    outputsSchema,
    commands: [cleanupClusterRegistry, clusterInit, uninstallGardenServices, pullImage],

    handlers: {
      configureProvider,
      getEnvironmentStatus,
      prepareEnvironment,
      cleanupEnvironment,
      getDebugInfo: debugInfo,
    },

    createActionTypes: {
      Deploy: [kubernetesDeployDefinition(), helmDeployDefinition()],
      Run: [kubernetesRunDefinition()],
      Test: [kubernetesTestDefinition()],
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
        docs: helmDeployDocs,
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
