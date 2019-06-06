/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import dedent = require("dedent")

import { joiArray, joiIdentifier, joiProviderName } from "../../config/common"
import { Provider, providerConfigBaseSchema, ProviderConfig } from "../../config/provider"
import { containerRegistryConfigSchema, ContainerRegistryConfig } from "../container/config"
import { PluginContext } from "../../plugin-context"
import { deline } from "../../util/string"

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

interface KubernetesResourceSpec {
  limits: {
    cpu: number,
    memory: number,
  },
  requests: {
    cpu: number,
    memory: number,
  }
}

interface KubernetesResources {
  builder: KubernetesResourceSpec
  registry: KubernetesResourceSpec
}

interface KubernetesStorageSpec {
  size: number
  storageClass: string | null
}

interface KubernetesStorage {
  builder: KubernetesStorageSpec
  registry: KubernetesStorageSpec
}

export interface KubernetesBaseConfig extends ProviderConfig {
  buildMode: string
  context: string
  defaultHostname?: string
  defaultUsername?: string
  forceSsl: boolean
  imagePullSecrets: SecretRef[]
  ingressHttpPort: number
  ingressHttpsPort: number
  ingressClass?: string
  namespace?: string
  resources: KubernetesResources
  storage: KubernetesStorage
  tlsCertificates: IngressTlsCertificate[]
  _systemServices: string[]
}

export interface KubernetesConfig extends KubernetesBaseConfig {
  deploymentRegistry?: ContainerRegistryConfig
}

export type KubernetesProvider = Provider<KubernetesConfig>
export type KubernetesPluginContext = PluginContext<KubernetesConfig>

export const defaultResources: KubernetesResources = {
  builder: {
    limits: {
      cpu: 2000,
      memory: 4096,
    },
    requests: {
      cpu: 200,
      memory: 512,
    },
  },
  registry: {
    limits: {
      cpu: 2000,
      memory: 4096,
    },
    requests: {
      cpu: 200,
      memory: 512,
    },
  },
}

export const defaultStorage: KubernetesStorage = {
  builder: {
    size: 10 * 1024,
    storageClass: null,
  },
  registry: {
    size: 10 * 1024,
    storageClass: null,
  },
}

const resourceSchema = (defaults: KubernetesResourceSpec) => Joi.object()
  .keys({
    limits: Joi.object()
      .keys({
        cpu: Joi.number()
          .integer()
          .default(defaults.limits.cpu)
          .description("CPU limit in millicpu."),
        memory: Joi.number()
          .integer()
          .default(defaults.limits.memory)
          .description("Memory limit in megabytes."),
      })
      .default(defaults.limits),
    requests: Joi.object()
      .keys({
        cpu: Joi.number()
          .integer()
          .default(defaults.requests.cpu)
          .description("CPU request in millicpu."),
        memory: Joi.number()
          .integer()
          .default(defaults.requests.memory)
          .description("Memory request in megabytes."),
      })
      .default(defaults.requests),
  })
  .default(defaults)

const storageSchema = (defaults: KubernetesStorageSpec) => Joi.object()
  .keys({
    size: Joi.number()
      .integer()
      .default(defaults.size)
      .description("Volume size for the registry in megabytes."),
    storageClass: Joi.string()
      .allow(null)
      .default(null)
      .description("Storage class to use for the volume."),
  })
  .default(defaults)

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
    buildMode: Joi.string()
      .allow("local", "cluster-docker")
      .default("local")
      .description(deline`
        Choose the mechanism used to build containers before deploying. By default it uses the local docker, but you
        can set it to 'cluster-docker' to sync files to a remote docker daemon, installed in the cluster, and build
        container images there.

        This is currently experimental and sometimes not needed (e.g. with Docker for Desktop), so it's not enabled
        by default.
      `),
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
    storage: Joi.object()
      .keys({
        builder: storageSchema(defaultStorage.builder),
        registry: storageSchema(defaultStorage.registry),
      })
      .default(defaultStorage)
      .description(deline`
        Storage parameters to set for the in-cluster builder and container registry persistent volume
        (which are automatically installed and used when buildMode=cluster-docker).
      `),
    resources: Joi.object()
      .keys({
        builder: resourceSchema(defaultResources.builder),
        registry: resourceSchema(defaultResources.registry),
      })
      .default(defaultResources)
      .description(deline`
        Resource requests and limits for the in-cluster builder and container registry
        (which are automatically installed and used when buildMode=cluster-docker).
      `),
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
    setupIngressController: Joi.string()
      .allow("nginx", false, null)
      .default(false)
      .description("Set this to `nginx` to install/enable the NGINX ingress controller."),
    _system: Joi.any().meta({ internal: true }),
  })
