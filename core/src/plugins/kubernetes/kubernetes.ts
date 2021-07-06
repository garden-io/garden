/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"

import { createGardenPlugin } from "../../types/plugin/plugin"
import { helmHandlers } from "./helm/handlers"
import { getAppNamespace, getSystemNamespace } from "./namespace"
import { getSecret, setSecret, deleteSecret } from "./secrets"
import { getEnvironmentStatus, prepareEnvironment, cleanupEnvironment } from "./init"
import { containerHandlers } from "./container/handlers"
import { kubernetesHandlers } from "./kubernetes-module/handlers"
import { ConfigureProviderParams } from "../../types/plugin/provider/configureProvider"
import { DebugInfo, GetDebugInfoParams } from "../../types/plugin/provider/getDebugInfo"
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
import { kubernetesModuleSpecSchema } from "./kubernetes-module/config"
import { helmModuleSpecSchema, helmModuleOutputsSchema } from "./helm/config"
import { isNumber } from "util"
import chalk from "chalk"
import pluralize from "pluralize"
import { getSystemMetadataNamespaceName } from "./system"
import { DOCS_BASE_URL } from "../../constants"
import { defaultIngressClass, inClusterRegistryHostname } from "./constants"
import { pvcModuleDefinition } from "./volumes/persistentvolumeclaim"
import { getModuleTypeUrl, getProviderUrl } from "../../docs/common"
import { helm3Spec } from "./helm/helm-cli"
import { sternSpec } from "./logs"
import { isString } from "lodash"
import { mutagenCliSpec } from "./mutagen"

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

  const buildMode = config.buildMode

  // TODO: clean this up, this is getting confusing here
  if (buildMode !== "local-docker") {
    const usingInClusterRegistry =
      !config.deploymentRegistry || config.deploymentRegistry.hostname === inClusterRegistryHostname

    if (usingInClusterRegistry) {
      // Deploy an in-cluster registry, unless otherwise specified.
      // This is a special configuration, used in combination with the registry-proxy service,
      // to make sure every node in the cluster can resolve the image from the registry we deploy in-cluster.
      config.deploymentRegistry = {
        hostname: inClusterRegistryHostname,
        // Default to use the project name as the namespace in the in-cluster registry, if none is explicitly
        // configured. This allows users to share builds for a project.
        namespace: config.deploymentRegistry?.namespace || projectName,
      }
      config._systemServices.push("docker-registry", "registry-proxy")
    }

    if (buildMode === "cluster-docker") {
      config._systemServices.push("build-sync", "util", "docker-daemon")

      // Set up an NFS provisioner if the user doesn't explicitly set a storage class for the shared sync volume
      if (!config.storage.sync.storageClass) {
        config._systemServices.push("nfs-provisioner")
      }
    }

    if (buildMode !== "cluster-buildkit" && !config.storage.sync.storageClass) {
    }
  } else if (config.name !== "local-kubernetes" && !config.deploymentRegistry) {
    throw new ConfigurationError(`kubernetes: must specify deploymentRegistry in config if using local build mode`, {
      config,
    })
  }

  if (config.kubeconfig) {
    config.kubeconfig = resolve(projectRoot, config.kubeconfig)
  }

  for (const { effect, key, operator, tolerationSeconds, value } of config.registryProxyTolerations) {
    if (!key && operator !== "Exists") {
      throw new ConfigurationError(`kubernetes: tolerations operator must be 'Exists' if tolerations key is empty`, {
        key,
        operator,
        config,
      })
    }
    if (isNumber(tolerationSeconds) && effect !== "NoExecute") {
      throw new ConfigurationError(`kubernetes: tolerations effect must be 'NoExecute' if toleration seconds is set`, {
        tolerationSeconds,
        effect,
        config,
      })
    }
    if (!!value && operator === "Exists") {
      throw new ConfigurationError(
        `kubernetes: tolerations value should be empty if tolerations operator is 'Exists'`,
        { value, operator, config }
      )
    }
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
  "metadata-namespace": joiIdentifier()
    .required()
    .description("The namespace used for Garden metadata (currently always the same as app-namespace).")
    .meta({ deprecated: true }),
})

const localKubernetesUrl = getProviderUrl("local-kubernetes")

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "kubernetes",
    dependencies: ["container"],
    docs: dedent`
    The \`kubernetes\` provider allows you to deploy [\`container\` modules](${getModuleTypeUrl("container")}) to
    Kubernetes clusters, and adds the [\`helm\`](${getModuleTypeUrl("helm")}) and
    [\`kubernetes\`](${getModuleTypeUrl("kubernetes")}) module types.

    For usage information, please refer to the [guides section](${DOCS_BASE_URL}/guides). A good place to start is
    the [Remote Kubernetes guide](${DOCS_BASE_URL}/guides/remote-kubernetes) guide if you're connecting to remote clusters.
    The [Getting Started](${DOCS_BASE_URL}/getting-started/0-introduction) guide is also helpful as an introduction.

    Note that if you're using a local Kubernetes cluster (e.g. minikube or Docker Desktop), the [local-kubernetes provider](${localKubernetesUrl}) simplifies (and automates) the configuration and setup quite a bit.
  `,
    configSchema: configSchema(),
    outputsSchema,
    commands: [cleanupClusterRegistry, clusterInit, uninstallGardenServices, pullImage],
    handlers: {
      configureProvider,
      getEnvironmentStatus,
      prepareEnvironment,
      cleanupEnvironment,
      getSecret,
      setSecret,
      deleteSecret,
      getDebugInfo: debugInfo,
    },
    createModuleTypes: [
      {
        name: "helm",
        docs: dedent`
        Specify a Helm chart (either in your repository or remote from a registry) to deploy.
        Refer to the [Helm guide](${DOCS_BASE_URL}/guides/using-helm-charts) for usage instructions.
      `,
        moduleOutputsSchema: helmModuleOutputsSchema(),
        schema: helmModuleSpecSchema(),
        handlers: helmHandlers,
      },
      {
        name: "kubernetes",
        docs: dedent`
        Specify one or more Kubernetes manifests to deploy.

        You can either (or both) specify the manifests as part of the \`garden.yml\` configuration, or you can refer to
        one or more files with existing manifests.

        Note that if you include the manifests in the \`garden.yml\` file, you can use
        [template strings](${DOCS_BASE_URL}/using-garden/variables-and-templating) to interpolate values into the manifests.

        If you need more advanced templating features you can use the [helm](${getModuleTypeUrl("helm")}) module type.
      `,
        moduleOutputsSchema: joi.object().keys({}),
        schema: kubernetesModuleSpecSchema(),
        handlers: kubernetesHandlers,
      },
      pvcModuleDefinition(),
    ],
    extendModuleTypes: [
      {
        name: "container",
        handlers: containerHandlers,
      },
    ],
    // DEPRECATED: Remove stern in v0.13
    tools: [kubectlSpec, helm3Spec, mutagenCliSpec, sternSpec],
  })
