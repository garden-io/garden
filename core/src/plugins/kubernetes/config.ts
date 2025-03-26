/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { StringMap } from "../../config/common.js"
import {
  joi,
  joiIdentifier,
  joiIdentifierDescription,
  joiProviderName,
  joiSparseArray,
  joiStringMap,
} from "../../config/common.js"
import type { BaseProviderConfig, Provider } from "../../config/provider.js"
import { providerConfigBaseSchema } from "../../config/provider.js"
import type { ContainerEnvVars, ContainerRegistryConfig } from "../container/moduleConfig.js"
import {
  artifactsDescription,
  commandExample,
  containerArtifactSchema,
  containerEnvVarsSchema,
  containerRegistryConfigSchema,
} from "../container/moduleConfig.js"
import type { PluginContext } from "../../plugin-context.js"
import { dedent, deline } from "../../util/string.js"
import type { SyncableKind } from "./types.js"
import { syncableKinds } from "./types.js"
import type { BaseTaskSpec } from "../../config/task.js"
import { baseTaskSpecSchema, cacheResultSchema } from "../../config/task.js"
import type { BaseTestSpec } from "../../config/test.js"
import { baseTestSpecSchema } from "../../config/test.js"
import type { ArtifactSpec } from "../../config/validation.js"
import type { V1Toleration } from "@kubernetes/client-node"
import { runPodSpecIncludeFields } from "./run.js"
import type { SyncDefaults } from "./sync.js"
import { syncDefaultsSchema } from "./sync.js"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl.js"
import { DOCS_BASE_URL } from "../../constants.js"
import { defaultKanikoImageName, defaultUtilImageRegistryDomain, defaultSystemNamespace } from "./constants.js"
import type { LocalKubernetesClusterType } from "./local/config.js"
import type { ActionKind } from "../../plugin/action-types.js"

export interface ProviderSecretRef {
  name: string
  namespace: string
}

export type TlsManager = "manual"
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

export interface KubernetesResourceConfig {
  cpu: number
  memory: number
  ephemeralStorage?: number
}

export interface KubernetesResourceSpec {
  limits: KubernetesResourceConfig
  requests: KubernetesResourceConfig
}

interface KubernetesResources {
  builder: KubernetesResourceSpec
  sync: KubernetesResourceSpec
  util: KubernetesResourceSpec
}

interface KubernetesStorageSpec {
  size?: number
  storageClass: string | null
}

interface KubernetesStorage {
  builder: KubernetesStorageSpec
}

const containerBuildModes = ["local-docker", "kaniko", "cluster-buildkit"] as const
export type ContainerBuildMode = (typeof containerBuildModes)[number]

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

export type KubernetesClusterType = LocalKubernetesClusterType

export interface KubernetesConfig extends BaseProviderConfig {
  utilImageRegistryDomain: string
  buildMode: ContainerBuildMode
  clusterBuildkit?: {
    cache: ClusterBuildkitCacheConfig[]
    rootless?: boolean
    nodeSelector?: StringMap
    tolerations?: V1Toleration[]
    annotations?: StringMap
    serviceAccountAnnotations?: StringMap
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
    annotations?: StringMap
    serviceAccountAnnotations?: StringMap
    util?: {
      tolerations?: V1Toleration[]
      annotations?: StringMap
      nodeSelector?: StringMap
    }
  }
  context: string
  defaultHostname?: string
  deploymentRegistry?: ContainerRegistryConfig
  sync?: {
    defaults?: SyncDefaults
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
  clusterType?: KubernetesClusterType
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
  util: {
    limits: {
      cpu: 256,
      memory: 512,
    },
    requests: {
      cpu: 256,
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
    .integer()
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
    images. This is necessary if you reference private images in your action configuration, and is required
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
      .required()
      .description("A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.")
      .example({ name: "my-tls-secret", namespace: "default" }),
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

      If not specified, use the configured \`deploymentRegistry\` in your kubernetes provider config.

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
         See the [clusterBuildkit cache option](#providersclusterbuildkitcache) for a description of the detection mechanism.

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

export const utilImageRegistryDomainSpec = joi.string().default(defaultUtilImageRegistryDomain).description(dedent`
    The container registry domain that should be used for pulling Garden utility images (such as the
    image used in the Kubernetes sync utility Pod).

    If you have your own Docker Hub registry mirror, you can set the domain here and the utility images
    will be pulled from there. This can be useful to e.g. avoid Docker Hub rate limiting.

    Otherwise the utility images are pulled directly from Docker Hub by default.
  `)

const buildModeSchema = () =>
  joi
    .string()
    .valid(...containerBuildModes)
    .default("local-docker")
    .description(
      dedent`
  Choose the mechanism for building container images before deploying. By default your local Docker daemon is used, but you can set it to \`cluster-buildkit\` or \`kaniko\` to sync files to the cluster, and build container images there. This removes the need to run Docker locally, and allows you to share layer and image caches between multiple developers, as well as between your development and CI workflows.

  For more details on all the different options and what makes sense to use for your setup, please check out the [in-cluster building guide](${DOCS_BASE_URL}/kubernetes-plugins/guides/in-cluster-building).
  `
    )

export const kubernetesConfigBase = () =>
  providerConfigBaseSchema()
    .keys({
      utilImageRegistryDomain: utilImageRegistryDomainSpec,
      buildMode: buildModeSchema(),
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

            | Registry Name                   | Registry Domain                    | Assumed \`mode=max\` support |
            |---------------------------------|------------------------------------|------------------------------|
            | AWS Elastic Container Registry  | \`dkr.ecr.<region>.amazonaws.com\` | Yes (with \`image-manifest=true\`) |
            | Google Cloud Artifact Registry  | \`pkg.dev\`                        | Yes                          |
            | Azure Container Registry        | \`azurecr.io\`                     | Yes                          |
            | GitHub Container Registry       | \`ghcr.io\`                        | Yes                          |
            | DockerHub                       | \`hub.docker.com\`                 | Yes                          |
            | Any other registry              |                                    | No                           |

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
          annotations: annotationsSchema().description(
            "Specify annotations to apply to both the Pod and Deployment resources associated with cluster-buildkit. Annotations may have an effect on the behaviour of certain components, for example autoscalers."
          ),
          serviceAccountAnnotations: serviceAccountAnnotationsSchema().description(
            "Specify annotations to apply to the Kubernetes service account used by cluster-buildkit. This can be useful to set up IRSA with in-cluster building."
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
              `Specify extra flags to use when building the container image with kaniko. Flags set on \`container\` Builds take precedence over these.`
            ),
          image: joi
            .string()
            .default(defaultKanikoImageName)
            .description(`Change the kaniko image (repository/image:tag) to use when building in kaniko mode.`),
          namespace: joi
            .string()
            .allow(null)
            .description(
              dedent`
              Choose the namespace where the Kaniko pods will be run. Defaults to the project namespace.
            `
            ),
          nodeSelector: joiStringMap(joi.string()).description(
            dedent`
            Exposes the \`nodeSelector\` field on the PodSpec of the Kaniko pods. This allows you to constrain the Kaniko pods to only run on particular nodes. The same nodeSelector will be used for each util pod unless they are specifically set under \`util.nodeSelector\`.

            [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning pods to nodes.
          `
          ),
          tolerations: joiSparseArray(tolerationSchema()).description(
            deline`Specify tolerations to apply to each Kaniko builder pod. Useful to control which nodes in a cluster can run builds.
          The same tolerations will be used for each util pod unless they are specifically set under \`util.tolerations\``
          ),
          annotations: annotationsSchema().description(
            deline`Specify annotations to apply to each Kaniko builder pod. Annotations may have an effect on the behaviour of certain components, for example autoscalers.
          The same annotations will be used for each util pod unless they are specifically set under \`util.annotations\``
          ),
          serviceAccountAnnotations: serviceAccountAnnotationsSchema().description(
            "Specify annotations to apply to the Kubernetes service account used by kaniko. This can be useful to set up IRSA with in-cluster building."
          ),
          util: joi.object().keys({
            tolerations: joiSparseArray(tolerationSchema()).description(
              "Specify tolerations to apply to each garden-util pod."
            ),
            annotations: annotationsSchema().description(
              "Specify annotations to apply to each garden-util pod and deployments."
            ),
            nodeSelector: joiStringMap(joi.string()).description(
              "Specify the nodeSelector constraints for each garden-util pod."
            ),
          }),
        })
        .default(() => {})
        .description("Configuration options for the `kaniko` build mode."),
      defaultHostname: joi
        .string()
        .description("A default hostname to use when no hostname is explicitly configured for a service.")
        .example("api.mydomain.com"),
      sync: joi
        .object()
        .keys({
          defaults: syncDefaultsSchema(),
        })
        .description("Configuration options for code synchronization."),
      forceSsl: joi
        .boolean()
        .default(false)
        .description(
          "Require SSL on all `container` Deploys. If set to true, an error is raised when no certificate " +
            "is available for a configured hostname on a `container`Deploy."
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
      resources: resourcesSchema(),
      tlsCertificates: joiSparseArray(tlsCertificateSchema())
        .unique("name")
        .description("One or more certificates to use for ingress."),
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
    .rename("devMode", "sync")

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

const annotationsSchema = () =>
  joiStringMap(joi.string())
    .example({
      "cluster-autoscaler.kubernetes.io/safe-to-evict": "false",
    })
    .optional()

const serviceAccountAnnotationsSchema = () =>
  joiStringMap(joi.string())
    .example({
      "eks.amazonaws.com/role-arn": "arn:aws:iam::111122223333:role/my-role",
    })
    .optional()

export const namespaceSchema = () =>
  joi.alternatives(
    joi.object().keys({
      name: namespaceNameSchema(),
      annotations: annotationsSchema().description("Map of annotations to apply to the namespace when creating it."),
      labels: joiStringMap(joi.string()).description("Map of labels to apply to the namespace when creating it."),
    }),
    namespaceNameSchema()
  ).description(dedent`
    Specify which namespace to deploy services to, and optionally annotations/labels to apply to the namespace.

    You can specify a string as a shorthand for \`name: <name>\`. Defaults to \`<project name>-<environment namespace>\`.

    Note that the framework may generate other namespaces as well with this name as a prefix. Also note that if the namespace previously exists, Garden will attempt to add the specified labels and annotations. If the user does not have permissions to do so, a warning is shown.
  `)

const kubectlPathExample = "${local.env.GARDEN_KUBECTL_PATH}?"

const deploymentRegistrySchema = () =>
  containerRegistryConfigSchema().description(
    dedent`
The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

Important: If you specify this in combination with in-cluster building, you must make sure \`imagePullSecrets\` includes authentication with the specified deployment registry, that has the appropriate write privileges (usually full write access to the configured \`deploymentRegistry.namespace\`).
`
  )

export const configSchema = () =>
  kubernetesConfigBase()
    .keys({
      name: joiProviderName("kubernetes"),
      context: k8sContextSchema().required(),
      deploymentRegistry: deploymentRegistrySchema(),
      ingressClass: joi.string().description(dedent`
        The ingress class or ingressClassName to use on configured Ingresses (via the \`kubernetes.io/ingress.class\` annotation or \`spec.ingressClassName\` field depending on the kubernetes version)
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
        deline`The name of the resource to sync to. If the action contains a single resource of the specified Kind,
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
        The Garden module that contains the sources for the container. This needs to be specified under \`serviceResource\` in order to enable syncing, but is not necessary for tasks and tests. Must be a \`container\` module.

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

export const runCacheResultSchema = (kind: ActionKind) =>
  cacheResultSchema().description(
    dedent`
Set to false if you don't want the ${kind} action result to be cached. Use this if the ${kind} action needs to be run any time your project (or one or more of the ${kind} action's dependants) is deployed. Otherwise the ${kind} action is only re-run when its version changes, or when you run \`garden run\`.
`
  )

export const kubernetesCommonRunSchemaKeys = (kind: ActionKind) => ({
  cacheResult: runCacheResultSchema(kind),
  command: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The command/entrypoint used to run inside the container.")
    .example(commandExample),
  args: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The arguments to pass to the command/entrypoint used for execution.")
    .example(["rake", "db:migrate"]),
  env: containerEnvVarsSchema(),
  artifacts: joiSparseArray(containerArtifactSchema()).description(artifactsDescription),
  namespace: namespaceNameSchema(),
})

export const runPodResourceSchema = (kind: string) =>
  targetResourceSpecSchema().description(
    dedent`
        Specify a Kubernetes resource to derive the Pod spec from for the ${kind}.

        This resource will be selected from the manifests provided in this ${kind}'s \`files\` or \`manifests\` config field.

        The following fields from the Pod will be used (if present) when executing the ${kind}:

        **Warning**: Garden will retain \`configMaps\` and \`secrets\` as volumes, but remove \`persistentVolumeClaim\` volumes from the Pod spec, as they might already be mounted.
        ${runPodSpecWhitelistDescription()}
        `
  )

// TODO: allow reading the pod spec from a file
export const runPodSpecSchema = (kind: string) =>
  joi
    .object()
    .description(
      dedent`
    Supply a custom Pod specification. This should be a normal Kubernetes Pod manifest. Note that the spec will be modified for the ${kind}, including overriding with other fields you may set here (such as \`args\` and \`env\`), and removing certain fields that are not supported.

    You can find the full Pod spec in the [official Kubernetes documentation](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/#PodSpec)

    The following Pod spec fields from the \`podSpec\` will be used (if present) when executing the ${kind}:
    ${runPodSpecWhitelistDescription()}
  `
    )
    .unknown(true)

export const kubernetesTaskSchema = () =>
  baseTaskSpecSchema()
    .keys({
      resource: serviceResourceSchema().description(
        dedent`The Deployment, DaemonSet, StatefulSet or Pod that Garden should use to execute this task.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.

        ${serviceResourceDescription}

        The following pod spec fields from the service resource will be used (if present) when executing the task:

        **Warning**: Garden will retain \`configMaps\` and \`secrets\` as volumes, but remove \`persistentVolumeClaim\` volumes from the Pod spec, as they might already be mounted.
        ${runPodSpecWhitelistDescription()}`
      ),
      ...kubernetesCommonRunSchemaKeys("Run"),
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

        **Warning**: Garden will retain \`configMaps\` and \`secrets\` as volumes, but remove \`persistentVolumeClaim\` volumes from the Pod spec, as they might already be mounted.
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

export const resourcesSchema = () =>
  joi
    .object()
    .keys({
      builder: resourceSchema(defaultResources.builder, false).description(dedent`
            Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're using when configuring this.

            When \`buildMode\` is \`kaniko\`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to consider the requirements for your individual image builds, with your most expensive/heavy images in mind.

            When \`buildMode\` is \`cluster-buildkit\`, this applies to the BuildKit deployment created in _each project namespace_. So think of this as the resource spec for each individual user or project namespace.
          `),
      util: resourceSchema(defaultResources.util, false).description(dedent`
            Resource requests and limits for the util pod for in-cluster builders.
            This pod is used to get, start, stop and inquire the status of the builds.

            This pod is created in each garden namespace.
          `),
      sync: resourceSchema(defaultResources.sync, true)
        .description(
          dedent`
            Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
            ahead of building images. This generally is not resource intensive, but you might want to adjust the
            defaults if you have many concurrent users.
          `
        )
        // TODO(deprecation): deprecate in 0.14
        .meta({
          deprecated: "The sync service is only used for the cluster-docker build mode, which is being deprecated.",
        }),
    })
    .default(defaultResources).description(deline`
        Resource requests and limits for the in-cluster builder..
      `)
