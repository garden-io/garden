/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  joi,
  joiArray,
  joiIdentifier,
  joiIdentifierDescription,
  joiProviderName,
  joiSparseArray,
  joiStringMap,
  StringMap,
} from "../../config/common"
import { BaseProviderConfig, Provider, providerConfigBaseSchema } from "../../config/provider"
import {
  artifactsDescription,
  commandExample,
  containerArtifactSchema,
  containerDevModeSchema,
  ContainerDevModeSpec,
  ContainerEnvVars,
  containerEnvVarsSchema,
  containerLocalModeSchema,
  ContainerLocalModeSpec,
  ContainerRegistryConfig,
  containerRegistryConfigSchema,
  syncDefaultDirectoryModeSchema,
  syncDefaultFileModeSchema,
  syncDefaultGroupSchema,
  syncDefaultOwnerSchema,
  syncExcludeSchema,
} from "../container/moduleConfig"
import { PluginContext } from "../../plugin-context"
import { dedent, deline } from "../../util/string"
import { defaultSystemNamespace } from "./system"
import { syncableKinds, SyncableKind } from "./types"
import { BaseTaskSpec, baseTaskSpecSchema, cacheResultSchema } from "../../config/task"
import { BaseTestSpec, baseTestSpecSchema } from "../../config/test"
import { ArtifactSpec } from "../../config/validation"
import { V1Toleration } from "@kubernetes/client-node"
import { runPodSpecIncludeFields } from "./run"
import { DevModeDefaults, devModeDefaultsSchema } from "./dev-mode"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { devModeGuideLink } from "./dev-mode"
import { localModeGuideLink } from "./local-mode"

export const DEFAULT_KANIKO_IMAGE = "gcr.io/kaniko-project/executor:v1.8.1-debug"

export interface KubernetesDevModeSpec extends ContainerDevModeSpec {
  containerName?: string
}

export interface KubernetesDevModeDefaults {
  exclude?: string[]
  fileMode?: number
  directoryMode?: number
  owner?: number | string
  group?: number | string
}

export const kubernetesDevModeSchema = () =>
  containerDevModeSchema().keys({
    containerName: joiIdentifier().description(
      `Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.`
    ),
  }).description(dedent`
    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

    Note that \`serviceResource\` must also be specified to enable dev mode.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${devModeGuideLink}) for more information.
  `)
/**
 * Provider-level dev mode settings for the local and remote k8s providers.
 */
export const kubernetesDevModeDefaultsSchema = () =>
  joi.object().keys({
    exclude: syncExcludeSchema().description(dedent`
        Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

        Any exclusion patterns defined in individual dev mode sync specs will be applied in addition to these patterns.

        \`.git\` directories and \`.garden\` directories are always ignored.
      `),
    fileMode: syncDefaultFileModeSchema(),
    directoryMode: syncDefaultDirectoryModeSchema(),
    owner: syncDefaultOwnerSchema(),
    group: syncDefaultGroupSchema(),
  }).description(dedent`
    Specifies default settings for dev mode syncs (e.g. for \`container\`, \`kubernetes\` and \`helm\` services).

    These are overridden/extended by the settings of any individual dev mode sync specs for a given module or service.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${devModeGuideLink}) for more information.
  `)

export interface KubernetesLocalModeSpec extends ContainerLocalModeSpec {
  containerName?: string
  target?: KubernetesTargetResourceSpec
}

export const kubernetesLocalModeSchema = () =>
  containerLocalModeSchema().keys({
    containerName: joi
      .string()
      .optional()
      .description(
        "When using the `defaultTarget` and not specifying `localMode.target`, this field can be used to override the default container name to proxy traffic from."
      ),
    target: targetResourceSpecSchema().description(
      "The remote Kubernetes resource to proxy traffic from. If specified, this is used instead of `defaultTarget`."
    ),
  }).description(dedent`
    Configures the local application which will send and receive network requests instead of the target resource specified by \`localMode.target\` or \`defaultTarget\`. One of those fields must be specified to enable local mode for the action.

    The selected container of the target Kubernetes resource will be replaced by a proxy container which runs an SSH server to proxy requests.
    Reverse port-forwarding will be automatically configured to route traffic to the locally run application and back.

    Local mode is enabled by setting the \`--local\` option on the \`garden deploy\` or \`garden dev\` commands.
    Local mode always takes the precedence over dev mode if there are any conflicting service names.

    Health checks are disabled for services running in local mode.

    See the [Local Mode guide](${localModeGuideLink}) for more information.
  `)

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
    ephemeralStorage?: number
  }
  requests: {
    cpu: number
    memory: number
    ephemeralStorage?: number
  }
}

interface KubernetesResources {
  builder: KubernetesResourceSpec
}

interface KubernetesStorageSpec {
  size?: number
  storageClass: string | null
}

interface KubernetesStorage {
  builder: KubernetesStorageSpec
}

export type ContainerBuildMode = "local-docker" | "kaniko" | "cluster-buildkit"

export type DefaultDeploymentStrategy = "rolling"
export type DeploymentStrategy = DefaultDeploymentStrategy | "blue-green"

export interface NamespaceConfig {
  name: string
  annotations?: StringMap
  labels?: StringMap
}

export interface ClusterBuildkitCacheConfig {
  type: "registry"
  mode: "min" | "max" | "inline" | "auto"
  tag: string
  export: boolean
  registry?: ContainerRegistryConfig
}

export interface KubernetesConfig extends BaseProviderConfig {
  buildMode: ContainerBuildMode
  clusterBuildkit?: {
    cache: ClusterBuildkitCacheConfig[]
    rootless?: boolean
    nodeSelector?: StringMap
    tolerations?: V1Toleration[]
  }
  jib?: {
    pushViaCluster?: boolean
  }
  kaniko?: {
    image?: string
    extraFlags?: string[]
    namespace?: string | null
    nodeSelector?: StringMap
    tolerations?: V1Toleration[]
  }
  context: string
  defaultHostname?: string
  deploymentRegistry?: ContainerRegistryConfig
  deploymentStrategy?: DeploymentStrategy
  devMode?: {
    defaults?: DevModeDefaults
  }
  forceSsl: boolean
  imagePullSecrets: ProviderSecretRef[]
  copySecrets: ProviderSecretRef[]
  ingressHttpPort: number
  ingressHttpsPort: number
  ingressClass?: string
  kubeconfig?: string
  kubectlPath?: string
  namespace?: NamespaceConfig
  setupIngressController: string | null
  systemNodeSelector: { [key: string]: string }
  resources: KubernetesResources
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
}

export const defaultStorage: KubernetesStorage = {
  builder: {
    size: 20 * 1024,
    storageClass: null,
  },
}

const resourceSchema = (defaults: KubernetesResourceSpec, deprecated: boolean) =>
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
            .example(defaults.limits.cpu)
            .meta({ deprecated }),
          memory: joi
            .number()
            .integer()
            .default(defaults.limits.memory)
            .description("Memory limit in megabytes.")
            .example(defaults.limits.memory)
            .meta({ deprecated }),
          ephemeralStorage: joi
            .number()
            .integer()
            .optional()
            .description("Ephemeral storage limit in megabytes.")
            .example(8192)
            .meta({ deprecated }),
        })
        .default(defaults.limits)
        .meta({ deprecated }),
      requests: joi
        .object()
        .keys({
          cpu: joi
            .number()
            .integer()
            .default(defaults.requests.cpu)
            .description("CPU request in millicpu.")
            .example(defaults.requests.cpu)
            .meta({ deprecated }),
          memory: joi
            .number()
            .integer()
            .default(defaults.requests.memory)
            .description("Memory request in megabytes.")
            .example(defaults.requests.memory)
            .meta({ deprecated }),
          ephemeralStorage: joi
            .number()
            .integer()
            .optional()
            .description("Ephemeral storage request in megabytes.")
            .example(8192)
            .meta({ deprecated }),
        })
        .default(defaults.requests)
        .meta({ deprecated }),
    })
    .default(defaults)

export const k8sDeploymentTimeoutSchema = () =>
  joi
    .number()
    .default(KUBECTL_DEFAULT_TIMEOUT)
    .description("The maximum duration (in seconds) to wait for resources to deploy and become healthy.")

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

const copySecretsSchema = () =>
  joiSparseArray(secretRef).description(dedent`
    References to secrets you need to have copied into all namespaces deployed to. These secrets will be
    ensured to exist in the namespace before deploying any service.
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

const buildkitCacheConfigurationSchema = () =>
  joi.object().keys({
    type: joi
      .string()
      .valid("registry")
      .required()
      .description(
        dedent`
          Use the Docker registry configured at \`deploymentRegistry\` to retrieve and store buildkit cache information.

          See also the [buildkit registry cache documentation](https://github.com/moby/buildkit#registry-push-image-and-cache-separately)
        `
      ),
    registry: containerRegistryConfigSchema().description(
      dedent`
      The registry from which the cache should be imported from, or which it should be exported to.

      If not specified, use the configured \`deploymentRegistry\` in your kubernetes provider config, or the internal in-cluster registry in case \`deploymentRegistry\` is not set.

      Important: You must make sure \`imagePullSecrets\` includes authentication with the specified cache registry, that has the appropriate write privileges (usually full write access to the configured \`namespace\`).
    `
    ),
    mode: joi
      .string()
      .valid("auto", "min", "max", "inline")
      .default("auto")
      .description(
        dedent`
        This is the buildkit cache mode to be used.

        The value \`inline\` ensures that garden is using the buildkit option \`--export-cache inline\`. Cache information will be inlined and co-located with the Docker image itself.

        The values \`min\` and \`max\` ensure that garden passes the \`mode=max\` or \`mode=min\` modifiers to the buildkit \`--export-cache\` option. Cache manifests will only be
        stored stored in the configured \`tag\`.

        \`auto\` is the same as \`max\` for some registries that are known to support it. Garden will fall back to \`inline\` for all other registries.
         See the [clusterBuildkit cache option](#providers-.clusterbuildkit.cache) for a description of the detection mechanism.

        See also the [buildkit export cache documentation](https://github.com/moby/buildkit#export-cache)
      `
      ),
    tag: joi
      .string()
      .default("_buildcache")
      .description(
        dedent`
        This is the Docker registry tag name buildkit should use for the registry build cache. Default is \`_buildcache\`

        **NOTE**: \`tag\` can only be used together with the \`registry\` cache type
      `
      ),
    export: joi
      .boolean()
      .default(true)
      .description(
        dedent`
        If this is false, only pass the \`--import-cache\` option to buildkit, and not the \`--export-cache\` option. Defaults to true.
      `
      ),
  })

export const kubernetesConfigBase = () =>
  providerConfigBaseSchema().keys({
    buildMode: joi
      .string()
      .valid("local-docker", "kaniko", "cluster-buildkit")
      .default("local-docker")
      .description(
        dedent`
        Choose the mechanism for building container images before deploying. By default your local Docker daemon is used, but you can set it to \`cluster-buildkit\` or \`kaniko\` to sync files to the cluster, and build container images there. This removes the need to run Docker locally, and allows you to share layer and image caches between multiple developers, as well as between your development and CI workflows.

        For more details on all the different options and what makes sense to use for your setup, please check out the [in-cluster building guide](https://docs.garden.io/guides/in-cluster-building).
        `
      ),
    clusterBuildkit: joi
      .object()
      .keys({
        cache: joi
          .array()
          .items(buildkitCacheConfigurationSchema())
          .default([{ type: "registry", mode: "auto", tag: "_buildcache", export: true }])
          .description(
            dedent`
            Use the \`cache\` configuration to customize the default cluster-buildkit cache behaviour.

            The default value is:
            \`\`\`yaml
            clusterBuildkit:
              cache:
                - type: registry
                  mode: auto
            \`\`\`

            For every build, this will
            - import cached layers from a docker image tag named \`_buildcache\`
            - when the build is finished, upload cache information to \`_buildcache\`

            For registries that support it, \`mode: auto\` (the default) will enable the buildkit \`mode=max\`
            option.

            See the following table for details on our detection mechanism:

            | Registry Name                   | Registry Domain         | Assumed \`mode=max\` support |
            |---------------------------------|-------------------------|------------------------------|
            | Google Cloud Artifact Registry  | \`pkg.dev\`             | Yes                          |
            | Azure Container Registry        | \`azurecr.io\`          | Yes                          |
            | GitHub Container Registry       | \`ghcr.io\`             | Yes                          |
            | DockerHub                       | \`hub.docker.com\`     | Yes                          |
            | Garden In-Cluster Registry      |                         | Yes                          |
            | Any other registry              |                         | No                           |

            In case you need to override the defaults for your registry, you can do it like so:

            \`\`\`yaml
            clusterBuildkit:
              cache:
                - type: registry
                  mode: max
            \`\`\`

            When you add multiple caches, we will make sure to pass the \`--import-cache\` options to buildkit in the same
            order as provided in the cache configuration. This is because buildkit will not actually use all imported caches
            for every build, but it will stick with the first cache that yields a cache hit for all the following layers.

            An example for this is the following:

            \`\`\`yaml
            clusterBuildkit:
              cache:
                - type: registry
                  tag: _buildcache-\${slice(kebabCase(git.branch), "0", "30")}
                - type: registry
                  tag: _buildcache-main
                  export: false
            \`\`\`

            Using this cache configuration, every build will first look for a cache specific to your feature branch.
            If it does not exist yet, it will import caches from the main branch builds (\`_buildcache-main\`).
            When the build is finished, it will only export caches to your feature branch, and avoid polluting the \`main\` branch caches.
            A configuration like that may improve your cache hit rate and thus save time.

            If you need to disable caches completely you can achieve that with the following configuration:

            \`\`\`yaml
            clusterBuildkit:
              cache: []
            \`\`\`
            `
          ),
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
        tolerations: joiSparseArray(tolerationSchema()).description(
          "Specify tolerations to apply to cluster-buildkit daemon. Useful to control which nodes in a cluster can run builds."
        ),
      })
      .default(() => ({}))
      .description("Configuration options for the `cluster-buildkit` build mode."),
    jib: joi
      .object()
      .keys({
        pushViaCluster: joi
          .boolean()
          .default(false)
          .description(
            "In some cases you may need to push images built with Jib to the remote registry via Kubernetes cluster, e.g. if you don't have connectivity or access from where Garden is being run. In that case, set this flag to true, but do note that the build will take considerably take longer to complete! Only applies when using in-cluster building."
          ),
      })
      .description("Setting related to Jib image builds."),
    kaniko: joi
      .object()
      .keys({
        extraFlags: joi
          .sparseArray()
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
        tolerations: joiSparseArray(tolerationSchema()).description(
          "Specify tolerations to apply to each Kaniko Pod. Useful to control which nodes in a cluster can run builds."
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
          Sets the deployment strategy for \`container\` services.

          The default is \`"rolling"\`, which performs rolling updates. There is also experimental support for blue/green deployments (via the \`"blue-green"\` strategy).

          Note that this setting only applies to \`container\` services (and not, for example,  \`kubernetes\` or \`helm\` services).
        `
      )
      .meta({
        experimental: true,
      }),
    devMode: joi
      .object()
      .keys({
        defaults: devModeDefaultsSchema(),
      })
      .description("Configuration options for dev mode."),
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
    copySecrets: copySecretsSchema(),
    // TODO: invert the resources and storage config schemas
    resources: joi
      .object()
      .keys({
        builder: resourceSchema(defaultResources.builder, false).description(dedent`
            Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're using when configuring this.

            When \`buildMode\` is \`kaniko\`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to consider the requirements for your individual image builds, with your most expensive/heavy images in mind.

            When \`buildMode\` is \`cluster-buildkit\`, this applies to the BuildKit deployment created in _each project namespace_. So think of this as the resource spec for each individual user or project namespace.
          `),
      })
      .default(defaultResources).description(deline`
        Resource requests and limits for the in-cluster builder..
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
  })

export const tolerationSchema = () =>
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

const kubectlPathExample = "${local.env.GARDEN_KUBECTL_PATH}?"

export const configSchema = () =>
  kubernetesConfigBase()
    .keys({
      name: joiProviderName("kubernetes"),
      context: k8sContextSchema().required(),
      deploymentRegistry: containerRegistryConfigSchema().description(
        dedent`
      The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

      Important: If you specify this in combination with in-cluster building, you must make sure \`imagePullSecrets\` includes authentication with the specified deployment registry, that has the appropriate write privileges (usually full write access to the configured \`deploymentRegistry.namespace\`).
    `
      ),
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
      kubeconfig: joi.string().description("Path to kubeconfig file to use instead of the system default."),
      kubectlPath: joi.string().description(dedent`
        Set a specific path to a kubectl binary, instead of having Garden download it automatically as required.

        It may be useful in some scenarios to allow individual users to set this, e.g. with an environment variable. You could configure that with something like \`kubectlPath: ${kubectlPathExample}\`.

        **Warning**: Garden may make some assumptions with respect to the kubectl version, so it is suggested to only use this when necessary.
      `),
      namespace: namespaceSchema(),
      setupIngressController: joi
        .string()
        .allow("nginx", false, null)
        .default(false)
        .description("Set this to `nginx` to install/enable the NGINX ingress controller."),
    })
    .unknown(false)

export interface KubernetesTargetResourceSpec {
  kind?: SyncableKind
  name?: string
  podSelector?: { [key: string]: string }
  containerName?: string
}

export interface ServiceResourceSpec extends KubernetesTargetResourceSpec {
  containerModule?: string
}

export const targetResourceSpecSchema = () =>
  joi
    .object()
    .keys({
      kind: joi
        .string()
        .valid(...syncableKinds)
        .description("The kind of Kubernetes resource to find."),
      name: joi
        .string()
        .description("The name of the resource, of the specified `kind`. If specified, you must also specify `kind`."),
      podSelector: podSelectorSchema(),
      containerName: targetContainerNameSchema(),
    })
    .with("name", ["kind"])
    .without("podSelector", ["kind", "name"])
    .xor("kind", "podSelector")

export interface KubernetesCommonRunSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  cacheResult: boolean
  command?: string[]
  env: ContainerEnvVars
  namespace?: string
}

export type KubernetesTaskSpec = BaseTaskSpec &
  KubernetesCommonRunSpec & {
    resource: ServiceResourceSpec
  }

export type KubernetesTestSpec = BaseTestSpec &
  KubernetesCommonRunSpec & {
    resource: ServiceResourceSpec
  }

export const serviceResourceDescription = dedent`
  This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the \`kind\` and \`name\` fields, or a Pod via the \`podSelector\` field.
`

export const targetContainerNameSchema = () =>
  joi
    .string()
    .description(
      `The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.`
    )

export const podSelectorSchema = () =>
  joiStringMap(joi.string()).description(
    dedent`
    A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.
  `
  )

export const serviceResourceSchema = () =>
  joi
    .object()
    .keys({
      kind: joi
        .string()
        .valid(...syncableKinds)
        .default("Deployment")
        .description("The type of Kubernetes resource to sync files to."),
      name: joi.string().description(
        deline`The name of the resource to sync to. If the module contains a single resource of the specified Kind,
        this can be omitted.`
      ),
      containerName: targetContainerNameSchema(),
      podSelector: podSelectorSchema(),
    })
    .oxor("podSelector", "name")

export const containerModuleSchema = () =>
  joiIdentifier()
    .description(
      dedent`
        The Garden module that contains the sources for the container. This needs to be specified under \`serviceResource\` in order to enable dev mode, but is not necessary for tasks and tests. Must be a \`container\` module.

        _Note: If you specify a module here, you don't need to specify it additionally under \`build.dependencies\`._`
    )
    .example("my-container-module")

export interface PortForwardSpec {
  name?: string
  resource: string
  targetPort: number
  localPort?: number
}

const portForwardSpecSchema = () =>
  joi.object().keys({
    name: joiIdentifier().description("An identifier to describe the port forward."),
    resource: joi
      .string()
      .required()
      .description(
        "The full resource kind and name to forward to, e.g. Service/my-service or Deployment/my-deployment. Note that Garden will not validate this ahead of attempting to start the port forward, so you need to make sure this is correctly set. The types of resources supported will match that of the `kubectl port-forward` CLI command."
      ),
    targetPort: joi.number().integer().required().description("The port number on the remote resource to forward to."),
    localPort: joi
      .number()
      .integer()
      .description(
        "The _preferred_ local port to forward from. If none is set, a random port is chosen. If the specified port is not available, a warning is shown and a random port chosen instead."
      ),
  })

export const portForwardsSchema = () =>
  joi
    .array()
    .items(portForwardSpecSchema())
    .description(
      "Manually specify port forwards that Garden should set up when deploying in dev or watch mode. If specified, these override the auto-detection of forwardable ports, so you'll need to specify the full list of port forwards to create."
    )

export const runPodSpecWhitelistDescription = () => runPodSpecIncludeFields.map((f) => `* \`${f}\``).join("\n")

export const kubernetesCommonRunSchemaKeys = () => ({
  cacheResult: cacheResultSchema(),
  command: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The command/entrypoint used to run inside the container.")
    .example(commandExample),
  args: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The arguments to pass to the command/entypoint used for execution.")
    .example(["rake", "db:migrate"]),
  env: containerEnvVarsSchema(),
  artifacts: joiSparseArray(containerArtifactSchema()).description(artifactsDescription),
  namespace: namespaceNameSchema(),
})

export const kubernetesTaskSchema = () =>
  baseTaskSpecSchema()
    .keys({
      resource: serviceResourceSchema().description(
        dedent`The Deployment, DaemonSet, StatefulSet or Pod that Garden should use to execute this task.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.

        ${serviceResourceDescription}

        The following pod spec fields from the service resource will be used (if present) when executing the task:
        ${runPodSpecWhitelistDescription()}`
      ),
      ...kubernetesCommonRunSchemaKeys(),
    })
    .description("The task definitions for this module.")

export const kubernetesTestSchema = () =>
  baseTestSpecSchema()
    .keys({
      resource: serviceResourceSchema().description(
        dedent`The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this test suite.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.

        ${serviceResourceDescription}

        The following pod spec fields from the service resource will be used (if present) when executing the test suite:
        ${runPodSpecWhitelistDescription()}`
      ),
      command: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description("The command/entrypoint used to run the test inside the container.")
        .example(commandExample),
      args: joi
        .sparseArray()
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
