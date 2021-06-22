/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")

import {
  joiArray,
  joiIdentifier,
  joiProviderName,
  joi,
  joiStringMap,
  StringMap,
  joiIdentifierDescription,
  joiSparseArray,
} from "../../config/common"
import { Provider, providerConfigBaseSchema, GenericProviderConfig } from "../../config/provider"
import {
  containerRegistryConfigSchema,
  ContainerRegistryConfig,
  commandExample,
  containerEnvVarsSchema,
  containerArtifactSchema,
  ContainerEnvVars,
  artifactsDescription,
} from "../container/config"
import { PluginContext } from "../../plugin-context"
import { deline } from "../../util/string"
import { defaultSystemNamespace } from "./system"
import { hotReloadableKinds, HotReloadableKind } from "./hot-reload/hot-reload"
import { baseTaskSpecSchema, BaseTaskSpec, cacheResultSchema } from "../../config/task"
import { baseTestSpecSchema, BaseTestSpec } from "../../config/test"
import { ArtifactSpec } from "../../config/validation"
import { V1Toleration } from "@kubernetes/client-node"
import { runPodSpecIncludeFields } from "./run"

export const DEFAULT_KANIKO_IMAGE = "gcr.io/kaniko-project/executor:v1.6.0-debug"
export interface ProviderSecretRef {
  name: string
  namespace: string
}

export type TlsManager = "cert-manager" | "manual"
export type LetsEncryptServerType = "letsencrypt-staging" | "letsencrypt-prod"
export type AcmeChallengeType = "HTTP-01"
export type IssuerType = "acme"

export interface IngressTlsCertificate {
  name: string
  hostnames?: string[]
  secretRef: ProviderSecretRef
  managedBy?: TlsManager
}

export interface CertManagerConfig {
  install: boolean
  email?: string
  issuer?: IssuerType
  acmeChallengeType?: AcmeChallengeType
  acmeServer?: LetsEncryptServerType
}

interface KubernetesResourceSpec {
  limits: {
    cpu: number
    memory: number
  }
  requests: {
    cpu: number
    memory: number
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

export type ContainerBuildMode = "local-docker" | "cluster-docker" | "kaniko" | "cluster-buildkit"

export type DefaultDeploymentStrategy = "rolling"
export type DeploymentStrategy = DefaultDeploymentStrategy | "blue-green"

export interface NamespaceConfig {
  name: string
  annotations?: StringMap
  labels?: StringMap
}

export interface KubernetesConfig extends GenericProviderConfig {
  buildMode: ContainerBuildMode
  clusterBuildkit?: {
    rootless?: boolean
    nodeSelector?: StringMap
  }
  clusterDocker?: {
    enableBuildKit?: boolean
  }
  kaniko?: {
    image?: string
    extraFlags?: string[]
    namespace?: string | null
    nodeSelector?: StringMap
  }
  context: string
  defaultHostname?: string
  deploymentRegistry?: ContainerRegistryConfig
  deploymentStrategy?: DeploymentStrategy
  forceSsl: boolean
  imagePullSecrets: ProviderSecretRef[]
  ingressHttpPort: number
  ingressHttpsPort: number
  ingressClass?: string
  kubeconfig?: string
  namespace?: NamespaceConfig
  registryProxyTolerations: V1Toleration[]
  systemNodeSelector: { [key: string]: string }
  resources: KubernetesResources
  storage: KubernetesStorage
  gardenSystemNamespace: string
  tlsCertificates: IngressTlsCertificate[]
  certManager?: CertManagerConfig
  clusterType?: "kind" | "minikube" | "microk8s"
  _systemServices: string[]
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
      cpu: 100,
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
      memory: 90,
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

const resourceSchema = (defaults: KubernetesResourceSpec) =>
  joi
    .object()
    .keys({
      limits: joi
        .object()
        .keys({
          cpu: joi
            .number()
            .integer()
            .default(defaults.limits.cpu)
            .description("CPU limit in millicpu.")
            .example(defaults.limits.cpu),
          memory: joi
            .number()
            .integer()
            .default(defaults.limits.memory)
            .description("Memory limit in megabytes.")
            .example(defaults.limits.memory),
        })
        .default(defaults.limits),
      requests: joi
        .object()
        .keys({
          cpu: joi
            .number()
            .integer()
            .default(defaults.requests.cpu)
            .description("CPU request in millicpu.")
            .example(defaults.requests.cpu),
          memory: joi
            .number()
            .integer()
            .default(defaults.requests.memory)
            .description("Memory request in megabytes.")
            .example(defaults.requests.memory),
        })
        .default(defaults.requests),
    })
    .default(defaults)

const storageSchema = (defaults: KubernetesStorageSpec) =>
  joi
    .object()
    .keys({
      size: joi.number().integer().default(defaults.size).description("Volume size in megabytes."),
      storageClass: joi
        .string()
        .allow(null)
        .default(defaults.storageClass)
        .description("Storage class to use for the volume."),
    })
    .default(defaults)

export const k8sContextSchema = () =>
  joi
    .string()
    .required()
    .description("The kubectl context to use to connect to the Kubernetes cluster.")
    .example("my-dev-context")

const secretRef = joi
  .object()
  .keys({
    name: joiIdentifier().required().description("The name of the Kubernetes secret.").example("my-secret"),
    namespace: joiIdentifier()
      .default("default")
      .description(
        "The namespace where the secret is stored. " +
          "If necessary, the secret may be copied to the appropriate namespace before use."
      ),
  })
  .description("Reference to a Kubernetes secret.")

const imagePullSecretsSchema = () =>
  joiSparseArray(secretRef).description(dedent`
    References to \`docker-registry\` secrets to use for authenticating with remote registries when pulling
    images. This is necessary if you reference private images in your module configuration, and is required
    when configuring a remote Kubernetes environment with buildMode=local.
  `)

const tlsCertificateSchema = () =>
  joi.object().keys({
    name: joiIdentifier()
      .required()
      .description("A unique identifier for this certificate.")
      .example("www")
      .example("wildcard"),
    hostnames: joi
      .array()
      .items(joi.hostname())
      .description(
        "A list of hostnames that this certificate should be used for. " +
          "If you don't specify these, they will be automatically read from the certificate."
      )
      .example(["www.mydomain.com"]),
    secretRef: secretRef
      .description("A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.")
      .example({ name: "my-tls-secret", namespace: "default" }),
    managedBy: joi
      .string()
      .description(
        dedent`
      Set to \`cert-manager\` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
      certificate. See our
      [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
    `
      )
      .allow("cert-manager")
      .example("cert-manager"),
  })

export const kubernetesConfigBase = () =>
  providerConfigBaseSchema().keys({
    buildMode: joi
      .string()
      .allow("local-docker", "cluster-docker", "kaniko", "cluster-buildkit")
      .default("local-docker")
      .description(
        dedent`
        Choose the mechanism for building container images before deploying. By default your local Docker daemon is used, but you can set it to \`cluster-buildkit\`, \`cluster-docker\` or \`kaniko\` to sync files to the cluster, and build container images there. This removes the need to run Docker locally, and allows you to share layer and image caches between multiple developers, as well as between your development and CI workflows.

        For more details on all the different options and what makes sense to use for your setup, please check out the [in-cluster building guide](https://docs.garden.io/guides/in-cluster-building).
        `
      ),
    clusterBuildkit: joi
      .object()
      .keys({
        rootless: joi
          .boolean()
          .default(false)
          .description(
            dedent`
            Enable rootless mode for the cluster-buildkit daemon, which runs the daemon with decreased privileges.
            Please see [the buildkit docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md) for caveats when using this mode.
            `
          ),
        nodeSelector: joiStringMap(joi.string())
          .description(
            dedent`
            Exposes the \`nodeSelector\` field on the PodSpec of the BuildKit deployment. This allows you to constrain the BuildKit daemon to only run on particular nodes.

            [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.
            `
          )
          .example({ disktype: "ssd" })
          .default(() => ({})),
      })
      .default(() => {})
      .description("Configuration options for the `cluster-buildkit` build mode."),
    clusterDocker: joi
      .object()
      .keys({
        enableBuildKit: joi
          .boolean()
          .default(false)
          .description(
            deline`
            Enable [BuildKit](https://github.com/moby/buildkit) support. This should in most cases work well and be
            more performant, but we're opting to keep it optional until it's enabled by default in Docker.
          `
          ),
      })
      .default(() => {})
      .description("Configuration options for the `cluster-docker` build mode."),
    kaniko: joi
      .object()
      .keys({
        extraFlags: joi
          .array()
          .items(joi.string())
          .description(
            `Specify extra flags to use when building the container image with kaniko. Flags set on \`container\` modules take precedence over these.`
          ),
        image: joi
          .string()
          .default(DEFAULT_KANIKO_IMAGE)
          .description(`Change the kaniko image (repository/image:tag) to use when building in kaniko mode.`),
        namespace: joi
          .string()
          .allow(null)
          .default(defaultSystemNamespace)
          .description(
            dedent`
              Choose the namespace where the Kaniko pods will be run. Set to \`null\` to use the project namespace.

              **IMPORTANT: The default namespace will change to the project namespace instead of the garden-system namespace in an upcoming release!**
            `
          ),
        nodeSelector: joiStringMap(joi.string()).description(
          dedent`
            Exposes the \`nodeSelector\` field on the PodSpec of the Kaniko pods. This allows you to constrain the Kaniko pods to only run on particular nodes.

            [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.
          `
        ),
      })
      .default(() => {})
      .description("Configuration options for the `kaniko` build mode."),
    defaultHostname: joi
      .string()
      .description("A default hostname to use when no hostname is explicitly configured for a service.")
      .example("api.mydomain.com"),
    deploymentStrategy: joi
      .string()
      .default("rolling")
      .allow("rolling", "blue-green")
      .description(
        dedent`
        Defines the strategy for deploying the project services.
        Default is "rolling update" and there is experimental support for "blue/green" deployment.
        The feature only supports modules of type \`container\`: other types will just deploy using the default strategy.
      `
      )
      .meta({
        experimental: true,
      }),
    forceSsl: joi
      .boolean()
      .default(false)
      .description(
        "Require SSL on all `container` module services. If set to true, an error is raised when no certificate " +
          "is available for a configured hostname on a `container` module."
      ),
    gardenSystemNamespace: joi
      .string()
      .default(defaultSystemNamespace)
      .description(
        dedent`
      Override the garden-system namespace name. This option is mainly used for testing.
      In most cases you should leave the default value.
      `
      )
      .meta({ internal: true }),
    imagePullSecrets: imagePullSecretsSchema(),
    // TODO: invert the resources and storage config schemas
    resources: joi
      .object()
      .keys({
        builder: resourceSchema(defaultResources.builder).description(dedent`
            Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're using when configuring this.

            When \`buildMode\` is \`kaniko\`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to consider the requirements for your individual image builds, with your most expensive/heavy images in mind.

            When \`buildMode\` is \`cluster-buildkit\`, this applies to the BuildKit deployment created in _each project namespace_. So think of this as the resource spec for each individual user or project namespace.

            When \`buildMode\` is \`cluster-docker\`, this applies to the single Docker Daemon that is installed and run cluster-wide. This is shared across all users and builds in the cluster, so it should be resourced accordingly, factoring in how many concurrent builds you expect and how heavy your builds tend to be.
          `),
        registry: resourceSchema(defaultResources.registry).description(dedent`
            Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
            so that they are available to all the nodes in your cluster.

            This is shared across all users and builds, so it should be resourced accordingly, factoring
            in how many concurrent builds you expect and how large your images tend to be.
          `),
        sync: resourceSchema(defaultResources.sync).description(dedent`
            Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
            ahead of building images. This generally is not resource intensive, but you might want to adjust the
            defaults if you have many concurrent users.
          `),
      })
      .default(defaultResources).description(deline`
        Resource requests and limits for the in-cluster builder, container registry and code sync service.
        (which are automatically installed and used when \`buildMode\` is \`cluster-docker\` or \`kaniko\`).
      `),
    storage: joi
      .object()
      .keys({
        builder: storageSchema(defaultStorage.builder).description(dedent`
            Storage parameters for the data volume for the in-cluster Docker Daemon.

            Only applies when \`buildMode\` is set to \`cluster-docker\`, ignored otherwise.
          `),
        nfs: joi
          .object()
          .keys({
            storageClass: joi
              .string()
              .allow(null)
              .default(null)
              .description("Storage class to use as backing storage for NFS ."),
          })
          .default({ storageClass: null }).description(dedent`
            Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
            you specify a \`storageClass\` for the sync volume. See the below \`sync\` parameter for more.

            Only applies when \`buildMode\` is set to \`cluster-docker\` or \`kaniko\`, ignored otherwise.
          `),
        registry: storageSchema(defaultStorage.registry).description(dedent`
            Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
            are available to all the nodes in your cluster.

            Only applies when \`buildMode\` is set to \`cluster-docker\` or \`kaniko\`, ignored otherwise.
          `),
        sync: storageSchema(defaultStorage.sync).description(dedent`
            Storage parameters for the code sync volume, which build contexts are synced to ahead of running
            in-cluster builds.

            Important: The storage class configured here has to support _ReadWriteMany_ access.
            If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
            NFS volume for the sync data volume.

            Only applies when \`buildMode\` is set to \`cluster-docker\` or \`kaniko\`, ignored otherwise.
          `),
      })
      .default(defaultStorage).description(dedent`
        Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
        (which are automatically installed and used when \`buildMode\` is \`cluster-docker\` or \`kaniko\`).

        These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
        factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.
      `),
    tlsCertificates: joiSparseArray(tlsCertificateSchema())
      .unique("name")
      .description("One or more certificates to use for ingress."),
    certManager: joi
      .object()
      .optional()
      .keys({
        install: joi.bool().default(false).description(dedent`
          Automatically install \`cert-manager\` on initialization. See the
          [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
        `),
        email: joi
          .string()
          .required()
          .description("The email to use when requesting Let's Encrypt certificates.")
          .example("yourname@example.com"),
        issuer: joi
          .string()
          .allow("acme")
          .default("acme")
          .description("The type of issuer for the certificate (only ACME is supported for now).")
          .example("acme"),
        acmeServer: joi
          .string()
          .allow("letsencrypt-staging", "letsencrypt-prod")
          .default("letsencrypt-staging")
          .description(
            deline`Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod
          servers are supported.`
          )
          .example("letsencrypt-staging"),
        acmeChallengeType: joi
          .string()
          .allow("HTTP-01")
          .default("HTTP-01")
          .description(
            deline`The type of ACME challenge used to validate hostnames and generate the certificates
          (only HTTP-01 is supported for now).`
          )
          .example("HTTP-01"),
      }).description(dedent`cert-manager configuration, for creating and managing TLS certificates. See the
        [cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.`),
    _systemServices: joiArray(joiIdentifier()).meta({ internal: true }),
    systemNodeSelector: joiStringMap(joi.string())
      .description(
        dedent`
        Exposes the \`nodeSelector\` field on the PodSpec of system services. This allows you to constrain the system services to only run on particular nodes.

        [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.
        `
      )
      .example({ disktype: "ssd" })
      .default(() => ({})),
    registryProxyTolerations: joiSparseArray(
      joi.object().keys({
        effect: joi.string().allow("NoSchedule", "PreferNoSchedule", "NoExecute").description(dedent`
          "Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
          allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".
        `),
        key: joi.string().description(dedent`
          "Key" is the taint key that the toleration applies to. Empty means match all taint keys.
          If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.
        `),
        operator: joi.string().allow("Exists", "Equal").default("Equal").description(dedent`
          "Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults to
          "Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
          particular category.
        `),
        tolerationSeconds: joi.string().description(dedent`
          "TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
          otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
          the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
          by the system.
        `),
        value: joi.string().description(dedent`
          "Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be empty,
          otherwise just a regular string.
        `),
      })
    ).description(dedent`
        For setting tolerations on the registry-proxy when using in-cluster building.
        The registry-proxy is a DaemonSet that proxies connections to the docker registry service on each node.

        Use this only if you're doing in-cluster building and the nodes in your cluster
        have [taints](https://kubernetes.io/docs/concepts/configuration/taint-and-toleration/).
      `),
  })

export const namespaceSchema = () =>
  joi.alternatives(
    joi.object().keys({
      name: namespaceNameSchema(),
      annotations: joiStringMap(joi.string()).description(
        "Map of annotations to apply to the namespace when creating it."
      ),
      labels: joiStringMap(joi.string()).description("Map of labels to apply to the namespace when creating it."),
    }),
    namespaceNameSchema()
  ).description(dedent`
    Specify which namespace to deploy services to, and optionally annotations/labels to apply to the namespace.

    You can specify a string as a shorthand for \`name: <name>\`. Defaults to \`<project name>-<environment namespace>\`.

    Note that the framework may generate other namespaces as well with this name as a prefix. Also note that if the namespace previously exists, Garden will attempt to add the specified labels and annotations. If the user does not have permissions to do so, a warning is shown.
  `)

export const configSchema = () =>
  kubernetesConfigBase()
    .keys({
      name: joiProviderName("kubernetes"),
      context: k8sContextSchema().required(),
      deploymentRegistry: containerRegistryConfigSchema().allow(null),
      ingressClass: joi.string().description(dedent`
        The ingress class to use on configured Ingresses (via the \`kubernetes.io/ingress.class\` annotation)
        when deploying \`container\` services. Use this if you have multiple ingress controllers in your cluster.
      `),
      ingressHttpPort: joi
        .number()
        .default(80)
        .description("The external HTTP port of the cluster's ingress controller."),
      ingressHttpsPort: joi
        .number()
        .default(443)
        .description("The external HTTPS port of the cluster's ingress controller."),
      kubeconfig: joi
        .posixPath()
        .description("Path to kubeconfig file to use instead of the system default. Must be a POSIX-style path."),
      namespace: namespaceSchema(),
      setupIngressController: joi
        .string()
        .allow("nginx", false, null)
        .default(false)
        .description("Set this to `nginx` to install/enable the NGINX ingress controller."),
    })
    .unknown(false)

export interface ServiceResourceSpec {
  kind: HotReloadableKind
  name?: string
  containerName?: string
  containerModule?: string
  hotReloadCommand?: string[]
  hotReloadArgs?: string[]
}

export interface KubernetesTaskSpec extends BaseTaskSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  cacheResult: boolean
  command?: string[]
  env: ContainerEnvVars
  resource: ServiceResourceSpec
}

export interface KubernetesTestSpec extends BaseTestSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  command?: string[]
  env: ContainerEnvVars
  resource: ServiceResourceSpec
}

export const serviceResourceSchema = () =>
  joi.object().keys({
    // TODO: consider allowing a `resource` field, that includes the kind and name (e.g. Deployment/my-deployment).
    kind: joi
      .string()
      .valid(...hotReloadableKinds)
      .default("Deployment")
      .description("The type of Kubernetes resource to sync files to."),
    name: joi.string().description(
      deline`The name of the resource to sync to. If the module contains a single resource of the specified Kind,
        this can be omitted.`
    ),
    containerName: joi.string().description(
      deline`The name of a container in the target. Specify this if the target contains more than one container
        and the main container is not the first container in the spec.`
    ),
  })

export const containerModuleSchema = () =>
  joiIdentifier()
    .description(
      deline`The Garden module that contains the sources for the container. This needs to be specified under
    \`serviceResource\` in order to enable hot-reloading, but is not necessary for tasks and tests.

    Must be a \`container\` module, and for hot-reloading to work you must specify the \`hotReload\` field
    on the container module.

    Note: If you specify a module here, you don't need to specify it additionally under \`build.dependencies\``
    )
    .example("my-container-module")

export const hotReloadArgsSchema = () =>
  joi
    .array()
    .items(joi.string())
    .description("If specified, overrides the arguments for the main container when running in hot-reload mode.")
    .example(["nodemon", "my-server.js"])

const runPodSpecWhitelistDescription = runPodSpecIncludeFields.map((f) => `* \`${f}\``).join("\n")

export const kubernetesTaskSchema = () =>
  baseTaskSpecSchema()
    .keys({
      resource: serviceResourceSchema().description(
        dedent`The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.

        The following pod spec fields from the service resource will be used (if present) when executing the task:
        ${runPodSpecWhitelistDescription}`
      ),
      cacheResult: cacheResultSchema(),
      command: joi
        .array()
        .items(joi.string().allow(""))
        .description("The command/entrypoint used to run the task inside the container.")
        .example(commandExample),
      args: joi
        .array()
        .items(joi.string().allow(""))
        .description("The arguments to pass to the container used for execution.")
        .example(["rake", "db:migrate"]),
      env: containerEnvVarsSchema(),
      artifacts: joiSparseArray(containerArtifactSchema()).description(artifactsDescription),
    })
    .description("The task definitions for this module.")

export const kubernetesTestSchema = () =>
  baseTestSpecSchema()
    .keys({
      resource: serviceResourceSchema().description(
        dedent`The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.

        The following pod spec fields from the service resource will be used (if present) when executing the test suite:
        ${runPodSpecWhitelistDescription}`
      ),
      command: joi
        .array()
        .items(joi.string().allow(""))
        .description("The command/entrypoint used to run the test inside the container.")
        .example(commandExample),
      args: joi
        .array()
        .items(joi.string().allow(""))
        .description("The arguments to pass to the container used for testing.")
        .example(["npm", "test"]),
      env: containerEnvVarsSchema(),
      artifacts: joiSparseArray(containerArtifactSchema()).description(artifactsDescription),
    })
    .description("The test suite definitions for this module.")

export const namespaceNameSchema = () =>
  joiIdentifier()
    .max(63) // Max length of a DNS label, and by extension max k8s namespace length
    .description("A valid Kubernetes namespace name. Must be a " + joiIdentifierDescription)
