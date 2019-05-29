/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import * as Bluebird from "bluebird"
import dedent = require("dedent")

import { joiArray, joiIdentifier, joiProviderName } from "../../config/common"
import { GardenPlugin } from "../../types/plugin/plugin"
import { Provider, providerConfigBaseSchema, ProviderConfig } from "../../config/project"
import { helmHandlers } from "./helm/handlers"
import { getAppNamespace, getMetadataNamespace } from "./namespace"
import { getSecret, setSecret, deleteSecret } from "./secrets"
import { containerRegistryConfigSchema, ContainerRegistryConfig } from "../container/config"
import { getEnvironmentStatus, prepareEnvironment, cleanupEnvironment } from "./init"
import { containerHandlers, mavenContainerHandlers } from "./container/handlers"
import { PluginContext } from "../../plugin-context"
import { kubernetesHandlers } from "./kubernetes-module/handlers"
import { ConfigureProviderParams, GetDebugInfoParams } from "../../types/plugin/params"
import { kubectl } from "./kubectl"
import { systemNamespace, systemMetadataNamespace } from "./system"
import { DebugInfo } from "../../types/plugin/outputs"

export const name = "kubernetes"

export interface SecretRef {
  name: string
  namespace: string
}

export interface IngressTlsCertificate {
  name: string
  hostnames?: string[]
  secretRef: SecretRef
}

export interface KubernetesBaseConfig extends ProviderConfig {
  context: string
  defaultHostname?: string
  defaultUsername?: string
  forceSsl: boolean
  imagePullSecrets: SecretRef[]
  ingressHttpPort: number
  ingressHttpsPort: number
  ingressClass?: string
  namespace?: string
  tlsCertificates: IngressTlsCertificate[]
  _systemServices: string[]
}

export interface KubernetesConfig extends KubernetesBaseConfig {
  deploymentRegistry?: ContainerRegistryConfig
}

export type KubernetesProvider = Provider<KubernetesConfig>
export type KubernetesPluginContext = PluginContext<KubernetesConfig>

export const k8sContextSchema = Joi.string()
  .required()
  .description("The kubectl context to use to connect to the Kubernetes cluster.")
  .example("my-dev-context")

const secretRef = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the Kubernetes secret.")
      .example("my-secret"),
    namespace: joiIdentifier()
      .default("default")
      .description(
        "The namespace where the secret is stored. " +
        "If necessary, the secret may be copied to the appropriate namespace before use.",
      ),
  })
  .description("Reference to a Kubernetes secret.")

const imagePullSecretsSchema = joiArray(secretRef)
  .description(dedent`
    References to \`docker-registry\` secrets to use for authenticating with remote registries when pulling
    images. This is necessary if you reference private images in your module configuration, and is required
    when configuring a remote Kubernetes environment.
  `)

const tlsCertificateSchema = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("A unique identifier for this certificate.")
      .example("www")
      .example("wildcard"),
    hostnames: Joi.array().items(Joi.string().hostname())
      .description(
        "A list of hostnames that this certificate should be used for. " +
        "If you don't specify these, they will be automatically read from the certificate.",
      )
      .example([["www.mydomain.com"], {}]),
    secretRef: secretRef
      .description("A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.")
      .example({ name: "my-tls-secret", namespace: "default" }),
  })

export const kubernetesConfigBase = providerConfigBaseSchema
  .keys({
    defaultHostname: Joi.string()
      .description("A default hostname to use when no hostname is explicitly configured for a service.")
      .example("api.mydomain.com"),
    defaultUsername: joiIdentifier()
      .description("Set a default username (used for namespacing within a cluster)."),
    forceSsl: Joi.boolean()
      .default(false)
      .description(
        "Require SSL on all services. If set to true, an error is raised when no certificate " +
        "is available for a configured hostname.",
      ),
    imagePullSecrets: imagePullSecretsSchema,
    tlsCertificates: joiArray(tlsCertificateSchema)
      .unique("name")
      .description("One or more certificates to use for ingress."),
    _systemServices: joiArray(joiIdentifier())
      .meta({ internal: true }),
  })

export const configSchema = kubernetesConfigBase
  .keys({
    name: joiProviderName("kubernetes"),
    context: k8sContextSchema
      .required(),
    deploymentRegistry: containerRegistryConfigSchema,
    ingressClass: Joi.string()
      .description(dedent`
        The ingress class to use on configured Ingresses (via the \`kubernetes.io/ingress.class\` annotation)
        when deploying \`container\` services. Use this if you have multiple ingress controllers in your cluster.
      `),
    ingressHttpPort: Joi.number()
      .default(80)
      .description("The external HTTP port of the cluster's ingress controller."),
    ingressHttpsPort: Joi.number()
      .default(443)
      .description("The external HTTPS port of the cluster's ingress controller."),
    namespace: Joi.string()
      .default(undefined, "<project name>")
      .description(
        "Specify which namespace to deploy services to (defaults to <project name>). " +
        "Note that the framework generates other namespaces as well with this name as a prefix.",
      ),
    _system: Joi.any().meta({ internal: true }),
  })

export async function configureProvider({ projectName, config }: ConfigureProviderParams<KubernetesConfig>) {
  if (!config.namespace) {
    config.namespace = projectName
  }

  return { name: config.name, config }
}

export async function debugInfo({ ctx, log }: GetDebugInfoParams): Promise<DebugInfo> {
  const k8sContext = <KubernetesPluginContext>ctx
  const { context } = k8sContext.provider.config
  const appNamespace = await getAppNamespace(k8sContext, log, k8sContext.provider)
  const appMetadataNamespace = await getMetadataNamespace(k8sContext, log, k8sContext.provider)

  const namespacesList = [appNamespace, appMetadataNamespace, systemNamespace, systemMetadataNamespace]
  const namespaces = await Bluebird.map(namespacesList, async (ns) => {
    const out = await kubectl.stdout({ log, context, args: ["get", "all", "--namespace", ns, "--output", "json"] })
    return {
      namespace: ns,
      output: JSON.parse(out),
    }
  })

  const version = await kubectl.stdout({ log, context, args: ["version", "--output", "json"] })

  return {
    info: { version: JSON.parse(version), namespaces },
  }
}

export function gardenPlugin(): GardenPlugin {
  return {
    configSchema,
    actions: {
      configureProvider,
      getEnvironmentStatus,
      prepareEnvironment,
      cleanupEnvironment,
      getSecret,
      setSecret,
      deleteSecret,
      getDebugInfo: debugInfo,
    },
    moduleActions: {
      "container": containerHandlers,
      // TODO: we should find a way to avoid having to explicitly specify the key here
      "maven-container": mavenContainerHandlers,
      "helm": helmHandlers,
      "kubernetes": kubernetesHandlers,
    },
  }
}
