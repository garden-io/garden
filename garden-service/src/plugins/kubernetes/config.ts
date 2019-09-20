/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")

import { joiArray, joiIdentifier, joiProviderName, joi } from "../../config/common"
import { Provider, providerConfigBaseSchema, ProviderConfig } from "../../config/provider"
import { containerRegistryConfigSchema, ContainerRegistryConfig } from "../container/config"
import { PluginContext } from "../../plugin-context"
import { deline } from "../../util/string"

export const name = "kubernetes"

export interface ProviderSecretRef {
  name: string
  namespace: string
}

export interface IngressTlsCertificate {
  name: string
  hostnames?: string[]
  secretRef: ProviderSecretRef
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
  sync: KubernetesResourceSpec
}

interface KubernetesStorageSpec {
  size?: number
  storageClass: string | null
}

interface KubernetesStorage {
  builder: KubernetesStorageSpec
  nfs: KubernetesStorageSpec
  registry: KubernetesStorageSpec
  sync: KubernetesStorageSpec
}

export type ContainerBuildMode = "local-docker" | "cluster-docker" | "kaniko"

export type DefaultDeploymentStrategy = "rolling"
export type DeploymentStrategy = DefaultDeploymentStrategy | "blue-green"

export interface KubernetesBaseConfig extends ProviderConfig {
  buildMode: ContainerBuildMode
  context: string
  defaultHostname?: string
  defaultUsername?: string
  deploymentStrategy?: DeploymentStrategy
  forceSsl: boolean
  imagePullSecrets: ProviderSecretRef[]
  ingressHttpPort: number
  ingressHttpsPort: number
  ingressClass?: string
  kubeconfig?: string
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

// We default to fairly low requests but high limits.
export const defaultResources: KubernetesResources = {
  builder: {
    limits: {
      cpu: 4000,
      memory: 8192,
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
  sync: {
    limits: {
      cpu: 500,
      memory: 512,
    },
    requests: {
      cpu: 100,
      memory: 64,
    },
  },
}

export const defaultStorage: KubernetesStorage = {
  builder: {
    size: 20 * 1024,
    storageClass: null,
  },
  nfs: {
    storageClass: null,
  },
  registry: {
    size: 20 * 1024,
    storageClass: null,
  },
  sync: {
    size: 10 * 1024,
    storageClass: null,
  },
}

const resourceSchema = (defaults: KubernetesResourceSpec) => joi.object()
  .keys({
    limits: joi.object()
      .keys({
        cpu: joi.number()
          .integer()
          .default(defaults.limits.cpu)
          .description("CPU limit in millicpu.")
          .example(defaults.limits.cpu),
        memory: joi.number()
          .integer()
          .default(defaults.limits.memory)
          .description("Memory limit in megabytes.")
          .example(defaults.limits.memory),
      })
      .default(defaults.limits),
    requests: joi.object()
      .keys({
        cpu: joi.number()
          .integer()
          .default(defaults.requests.cpu)
          .description("CPU request in millicpu.")
          .example(defaults.requests.cpu),
        memory: joi.number()
          .integer()
          .default(defaults.requests.memory)
          .description("Memory request in megabytes.")
          .example(defaults.requests.memory),
      })
      .default(defaults.requests),
  })
  .default(defaults)

const storageSchema = (defaults: KubernetesStorageSpec) => joi.object()
  .keys({
    size: joi.number()
      .integer()
      .default(defaults.size)
      .description("Volume size in megabytes."),
    storageClass: joi.string()
      .allow(null)
      .default(defaults.storageClass)
      .description("Storage class to use for the volume."),
  })
  .default(defaults)

export const k8sContextSchema = joi.string()
  .required()
  .description("The kubectl context to use to connect to the Kubernetes cluster.")
  .example("my-dev-context")

const secretRef = joi.object()
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
    when configuring a remote Kubernetes environment with buildMode=local.
  `)

const tlsCertificateSchema = joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("A unique identifier for this certificate.")
      .example("www")
      .example("wildcard"),
    hostnames: joi.array().items(joi.string().hostname())
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
    buildMode: joi.string()
      .allow("local-docker", "cluster-docker", "kaniko")
      .default("local-docker")
      .description(dedent`
        Choose the mechanism for building container images before deploying. By default it uses the local Docker
        daemon, but you can set it to \`cluster-docker\` or \`kaniko\` to sync files to a remote Docker daemon,
        installed in the cluster, and build container images there. This removes the need to run Docker or
        Kubernetes locally, and allows you to share layer and image caches between multiple developers, as well
        as between your development and CI workflows.

        This is currently experimental and sometimes not desired, so it's not enabled by default. For example when using
        the \`local-kubernetes\` provider with Docker for Desktop and Minikube, we directly use the in-cluster docker
        daemon when building. You might also be deploying to a remote cluster that isn't intended as a development
        environment, so you'd want your builds to happen elsewhere.

        Functionally, both \`cluster-docker\` and \`kaniko\` do the same thing, but use different underlying mechanisms
        to build. The former uses a normal Docker daemon in the cluster. Because this has to run in privileged mode,
        this is less secure than Kaniko, but in turn it is generally faster. See the
        [Kaniko docs](https://github.com/GoogleContainerTools/kaniko) for more information on Kaniko.
      `),
    defaultHostname: joi.string()
      .description("A default hostname to use when no hostname is explicitly configured for a service.")
      .example("api.mydomain.com"),
    defaultUsername: joiIdentifier()
      .description("Set a default username (used for namespacing within a cluster)."),
    deploymentStrategy: joi.string()
      .default("rolling")
      .allow("rolling", "blue-green")
      .description(dedent`
        Defines the strategy for deploying the project services.
        Default is "rolling update" and there is experimental support for "blue/green" deployment.
        The feature only supports modules of type \`container\`: other types will just deploy using the default strategy.
      `)
      .meta({
        experimental: true,
      }),
    forceSsl: joi.boolean()
      .default(false)
      .description(
        "Require SSL on all `container` module services. If set to true, an error is raised when no certificate " +
        "is available for a configured hostname on a `container` module.",
      ),
    imagePullSecrets: imagePullSecretsSchema,
    resources: joi.object()
      .keys({
        builder: resourceSchema(defaultResources.builder)
          .description(dedent`
            Resource requests and limits for the in-cluster builder.

            When \`buildMode\` is \`cluster-docker\`, this refers to the Docker Daemon that is installed and run
            cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
            in how many concurrent builds you expect and how heavy your builds tend to be.

            When \`buildMode\` is \`kaniko\`, this refers to _each instance_ of Kaniko, so you'd generally use lower
            limits/requests, but you should evaluate based on your needs.
          `),
        registry: resourceSchema(defaultResources.registry)
          .description(dedent`
            Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
            so that they are available to all the nodes in your cluster.

            This is shared across all users and builds, so it should be resourced accordingly, factoring
            in how many concurrent builds you expect and how large your images tend to be.
          `),
        sync: resourceSchema(defaultResources.sync)
          .description(dedent`
            Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
            ahead of building images. This generally is not resource intensive, but you might want to adjust the
            defaults if you have many concurrent users.
          `),
      })
      .default(defaultResources)
      .description(deline`
        Resource requests and limits for the in-cluster builder, container registry and code sync service.
        (which are automatically installed and used when \`buildMode\` is \`cluster-docker\` or \`kaniko\`).
      `),
    storage: joi.object()
      .keys({
        builder: storageSchema(defaultStorage.builder)
          .description(dedent`
            Storage parameters for the data volume for the in-cluster Docker Daemon.

            Only applies when \`buildMode\` is set to \`cluster-docker\`, ignored otherwise.
          `),
        nfs: joi.object()
          .keys({
            storageClass: joi.string()
              .allow(null)
              .default(null)
              .description("Storage class to use as backing storage for NFS ."),
          })
          .default({ storageClass: null })
          .description(dedent`
            Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
            you specify a \`storageClass\` for the sync volume. See the below \`sync\` parameter for more.

            Only applies when \`buildMode\` is set to \`cluster-docker\` or \`kaniko\`, ignored otherwise.
          `),
        registry: storageSchema(defaultStorage.registry)
          .description(dedent`
            Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
            are available to all the nodes in your cluster.

            Only applies when \`buildMode\` is set to \`cluster-docker\` or \`kaniko\`, ignored otherwise.
          `),
        sync: storageSchema(defaultStorage.sync)
          .description(dedent`
            Storage parameters for the code sync volume, which build contexts are synced to ahead of running
            in-cluster builds.

            Important: The storage class configured here has to support _ReadWriteMany_ access.
            If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
            NFS volume for the sync data volume.

            Only applies when \`buildMode\` is set to \`cluster-docker\` or \`kaniko\`, ignored otherwise.
          `),
      })
      .default(defaultStorage)
      .description(dedent`
        Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
        (which are automatically installed and used when \`buildMode\` is \`cluster-docker\` or \`kaniko\`).

        These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
        factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.
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
    ingressClass: joi.string()
      .description(dedent`
        The ingress class to use on configured Ingresses (via the \`kubernetes.io/ingress.class\` annotation)
        when deploying \`container\` services. Use this if you have multiple ingress controllers in your cluster.
      `),
    ingressHttpPort: joi.number()
      .default(80)
      .description("The external HTTP port of the cluster's ingress controller."),
    ingressHttpsPort: joi.number()
      .default(443)
      .description("The external HTTPS port of the cluster's ingress controller."),
    kubeconfig: joi.string()
      .posixPath()
      .description("Path to kubeconfig file to use instead of the system default. Must be a POSIX-style path."),
    namespace: joi.string()
      .default(undefined, "<project name>")
      .description(
        "Specify which namespace to deploy services to (defaults to <project name>). " +
        "Note that the framework generates other namespaces as well with this name as a prefix.",
      ),
    setupIngressController: joi.string()
      .allow("nginx", false, null)
      .default(false)
      .description("Set this to `nginx` to install/enable the NGINX ingress controller."),
  })
  .unknown(false)
