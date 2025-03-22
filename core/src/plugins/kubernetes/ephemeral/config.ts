/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"

const { mkdirp, writeFile } = fsExtra
import { load } from "js-yaml"
import moment from "moment"
import { join } from "path"
import { joi, joiProviderName } from "../../../config/common.js"
import { providerConfigBaseSchema } from "../../../config/provider.js"
import { ConfigurationError } from "../../../exceptions.js"
import type { ConfigureProviderParams } from "../../../plugin/handlers/Provider/configureProvider.js"
import { dedent } from "../../../util/string.js"
import type { KubernetesConfig } from "../config.js"
import { defaultResources, utilImageRegistryDomainSpec } from "../config.js"
import { namespaceSchema } from "../config.js"
import { EPHEMERAL_KUBERNETES_PROVIDER_NAME } from "./ephemeral.js"
import { defaultSystemNamespace } from "../constants.js"
import { styles } from "../../../logger/styles.js"
import { isGardenCommunityEdition } from "../../../cloud/util.js"
import { reportDeprecatedFeatureUsage } from "../../../util/deprecations.js"

export type EphemeralKubernetesClusterType = "ephemeral"

export const configSchema = () =>
  providerConfigBaseSchema()
    .keys({
      name: joiProviderName(EPHEMERAL_KUBERNETES_PROVIDER_NAME),
      utilImageRegistryDomain: utilImageRegistryDomainSpec,
      namespace: namespaceSchema().description(
        "Specify which namespace to deploy services to (defaults to the project name). " +
          "Note that the framework generates other namespaces as well with this name as a prefix."
      ),
      setupIngressController: joi
        .string()
        .allow("nginx", false, null)
        .default("nginx")
        .description(
          dedent`Set this to null or false to skip installing/enabling the \`nginx\` ingress controller. Note: if you skip installing the \`nginx\` ingress controller for ephemeral cluster, your ingresses may not function properly.`
        ),
    })
    .description(`The provider configuration for the ${EPHEMERAL_KUBERNETES_PROVIDER_NAME} plugin.`)

export async function configureProvider(params: ConfigureProviderParams<KubernetesConfig>) {
  const { base, log, ctx, config: baseConfig } = params

  reportDeprecatedFeatureUsage({ log, deprecation: "ephemeralKubernetesProvider" })

  if (!ctx.cloudApi) {
    throw new ConfigurationError({
      message: `You are not logged in. You must log in with the ${styles.command(
        "garden login"
      )} command to use the ${EPHEMERAL_KUBERNETES_PROVIDER_NAME} plugin`,
    })
  }
  if (ctx.cloudApi && !isGardenCommunityEdition(ctx.cloudApi.domain)) {
    throw new ConfigurationError({
      message: `${EPHEMERAL_KUBERNETES_PROVIDER_NAME} provider is currently not supported for ${ctx.cloudApi.distroName}.`,
    })
  }

  // creating tmp dir .garden/ephemeral-kubernetes for storing kubeconfig
  const ephemeralClusterDirPath = join(ctx.gardenDirPath, "ephemeral-kubernetes")
  await mkdirp(ephemeralClusterDirPath)

  log.info("Getting cluster info...")
  const createEphemeralClusterResponse = await ctx.cloudApi.createEphemeralCluster()
  const clusterId = createEphemeralClusterResponse.instanceMetadata.instanceId

  const deadlineDateTime = moment(createEphemeralClusterResponse.instanceMetadata.deadline)
  const diffInNowAndDeadline = moment.duration(deadlineDateTime.diff(moment())).asMinutes().toFixed(1)
  log.info(
    `Cluster will be destroyed in ${styles.highlight(diffInNowAndDeadline)} minutes (at ${deadlineDateTime.format(
      "YYYY-MM-DD HH:mm:ss"
    )})`
  )

  log.info("Getting kubeconfig...")
  const kubeConfig = await ctx.cloudApi.getKubeConfigForCluster(clusterId)
  const kubeconfigFileName = `${clusterId}-kubeconfig.yaml`
  const kubeConfigPath = join(ctx.gardenDirPath, "ephemeral-kubernetes", kubeconfigFileName)
  await writeFile(kubeConfigPath, kubeConfig)
  log.info(`Kubeconfig saved at local path: ${styles.highlight(kubeConfigPath)}`)

  const parsedKubeConfig: any = load(kubeConfig)
  baseConfig.context = parsedKubeConfig["current-context"]
  baseConfig.kubeconfig = kubeConfigPath

  // set deployment registry
  baseConfig.deploymentRegistry = {
    hostname: createEphemeralClusterResponse.registry.endpointAddress,
    namespace: createEphemeralClusterResponse.registry.repository,
    insecure: false,
  }

  // set imagePullSecrets
  baseConfig.imagePullSecrets = [
    {
      name: createEphemeralClusterResponse.registry.imagePullSecret.name,
      namespace: createEphemeralClusterResponse.registry.imagePullSecret.namespace,
    },
  ]

  // set build mode to kaniko
  baseConfig.buildMode = "kaniko"

  // set resource requests and limits defaults for builder, sync and util
  baseConfig.resources = defaultResources

  // set additional kaniko flags
  baseConfig.kaniko = {
    extraFlags: [
      `--registry-mirror=${createEphemeralClusterResponse.registry.endpointAddress}`,
      `--registry-mirror=${createEphemeralClusterResponse.registry.dockerRegistryMirror}`,
      "--insecure-pull",
      "--force",
    ],
  }

  // set default hostname
  baseConfig.defaultHostname = createEphemeralClusterResponse.ingressesHostname

  // use garden-system as system namespace for ephemeral-kubernetes
  baseConfig.gardenSystemNamespace = defaultSystemNamespace

  // set the proper cluster type explicitly
  baseConfig.clusterType = "ephemeral"

  const kubernetesPluginConfig = {
    ...params,
    config: {
      ...baseConfig,
    },
  }
  const { config: updatedConfig } = await base!(kubernetesPluginConfig)

  return {
    config: updatedConfig,
  }
}
