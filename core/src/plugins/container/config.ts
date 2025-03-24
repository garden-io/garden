/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Primitive, PrimitiveMap } from "../../config/common.js"
import {
  artifactsTargetDescription,
  envVarRegex,
  joi,
  joiPrimitive,
  joiSparseArray,
  joiStringMap,
  joiUserIdentifier,
  createSchema,
} from "../../config/common.js"
import type { ArtifactSpec } from "../../config/validation.js"
import { ingressHostnameSchema, linkUrlSchema } from "../../types/service.js"
import { DEFAULT_PORT_PROTOCOL } from "../../constants.js"
import { dedent, deline } from "../../util/string.js"
import { k8sDeploymentTimeoutSchema, runCacheResultSchema } from "../kubernetes/config.js"
import type { BuildAction, BuildActionConfig } from "../../actions/build.js"
import type { DeployAction, DeployActionConfig } from "../../actions/deploy.js"
import type { TestAction, TestActionConfig } from "../../actions/test.js"
import type { RunAction, RunActionConfig } from "../../actions/run.js"
import { memoize } from "lodash-es"
import type Joi from "@hapi/joi"
import type { OctalPermissionMask } from "../kubernetes/types.js"
import { templateStringLiteral } from "../../docs/common.js"
import { syncGuideLink } from "../kubernetes/constants.js"
import { makeSecret, type Secret } from "../../util/secrets.js"
import type { ActionKind } from "../../plugin/action-types.js"
import { makeDeprecationMessage } from "../../util/deprecations.js"

export const defaultDockerfileName = "Dockerfile"

export const defaultContainerLimits: ServiceLimitSpec = {
  cpu: 1000, // = 1000 millicpu = 1 CPU
  memory: 1024, // = 1024MB = 1GB
}

export const defaultContainerResources: ContainerResourcesSpec = {
  cpu: {
    min: 10,
    max: 1000,
  },
  memory: {
    min: 90, // This is the minimum in some clusters.
    max: 1024,
  },
}

export interface ContainerIngressSpec {
  annotations: Annotations
  linkUrl?: string
  hostname?: string
  path: string
  port: string
}

export type ServicePortProtocol = "TCP" | "UDP"

export interface ServicePortSpec {
  name: string
  protocol: ServicePortProtocol
  containerPort: number
  localPort?: number
  // Defaults to containerPort
  servicePort: number
  hostPort?: number
  nodePort?: number | true
}

export interface ContainerVolumeSpecBase {
  name: string
  containerPath: string
  hostPath?: string
}

export interface ContainerVolumeSpec extends ContainerVolumeSpecBase {}

export interface ServiceHealthCheckSpec {
  httpGet?: {
    path: string
    port: string
    scheme?: "HTTP" | "HTTPS"
  }
  command?: string[]
  tcpPort?: string
  readinessTimeoutSeconds?: number
  livenessTimeoutSeconds?: number
}

/**
 * DEPRECATED: Use {@link ContainerResourcesSpec} instead.
 */
export interface ServiceLimitSpec {
  cpu: number
  memory: number
}

export interface ContainerResourcesSpec {
  cpu: {
    min: number
    max: number | null
  }
  memory: {
    min: number
    max: number | null
  }
}

interface Annotations {
  [name: string]: string
}

const deploymentStrategies = ["RollingUpdate", "Recreate"] as const
export type DeploymentStrategy = (typeof deploymentStrategies)[number]
export const defaultDeploymentStrategy: DeploymentStrategy = "RollingUpdate"

export const commandExample = ["/bin/sh", "-c"]

export type SyncMode =
  | "one-way"
  | "one-way-safe"
  | "one-way-replica"
  | "one-way-reverse"
  | "one-way-replica-reverse"
  | "two-way"
  | "two-way-safe"
  | "two-way-resolved"

export const defaultSyncMode: SyncMode = "one-way-safe"

export interface DevModeSyncOptions {
  mode?: SyncMode
  exclude?: string[]
  defaultFileMode?: OctalPermissionMask
  defaultDirectoryMode?: OctalPermissionMask
  defaultOwner?: number | string
  defaultGroup?: number | string
}

export interface DevModeSyncSpec extends DevModeSyncOptions {
  source: string
  target: string
}

const permissionsDocs =
  "See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information."

const ownerDocs =
  "Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information."

export const syncExcludeSchema = memoize(() =>
  joi
    .array()
    .items(joi.posixPath().allowGlobs().subPathOnly())
    .description(
      dedent`
        Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

        \`.git\` directories and \`.garden\` directories are always ignored.
      `
    )
    .example(["dist/**/*", "*.log"])
)

export const syncModeSchema = memoize(() =>
  joi
    .string()
    .allow(
      "one-way",
      "one-way-safe",
      "one-way-replica",
      "one-way-reverse",
      "one-way-replica-reverse",
      "two-way",
      "two-way-safe",
      "two-way-resolved"
    )
    .only()
    .default(defaultSyncMode)
    .description(
      `The sync mode to use for the given paths. See the [Code Synchronization guide](${syncGuideLink}) for details.`
    )
)

const octalPermissionValidationRangeError = deline`
Mode permission bits out of range.
Please specify a number between 0 and 0o777 in octal representation. The number needs to be prefixed with '0o' in YAML, e.g. 0o777.
`
const octalPermissionValidationErrors: Joi.LanguageMessages = {
  "number.min": octalPermissionValidationRangeError,
  "number.max": octalPermissionValidationRangeError,
}

export const syncDefaultFileModeSchema = memoize(() =>
  joi
    .number()
    .min(0o0)
    .max(0o777)
    .default(0o644)
    .meta({ isOctal: true })
    .messages(octalPermissionValidationErrors)
    .description(
      "The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0o644 (user can read/write, everyone else can read). " +
        permissionsDocs
    )
)

export const syncDefaultDirectoryModeSchema = memoize(() =>
  joi
    .number()
    .min(0o0)
    .max(0o777)
    .default(0o755)
    .meta({ isOctal: true })
    .messages(octalPermissionValidationErrors)
    .description(
      "The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0o755 (user can read/write, everyone else can read). " +
        permissionsDocs
    )
)

export const syncDefaultOwnerSchema = memoize(() =>
  joi
    .alternatives(joi.number().integer(), joi.string())
    .description("Set the default owner of files and directories at the target. " + ownerDocs)
)

export const syncDefaultGroupSchema = memoize(() =>
  joi
    .alternatives(joi.number().integer(), joi.string())
    .description("Set the default group on files and directories at the target. " + ownerDocs)
)

const exampleActionRef = templateStringLiteral("actions.build.my-container-image.sourcePath")
const backSlash = "`\\`"
const forwardSlash = "`/`"

export const syncSourcePathSchema = memoize(() =>
  joi
    .string()
    .default(".")
    .description(
      deline`
        Path to a local directory to be synchronized with the target.

        This should generally be a templated path to another action's source path (e.g. ${exampleActionRef}), or a relative path.

        If a path is hard-coded, we recommend sticking with relative paths here, and using forward slashes (${forwardSlash}) as a delimiter, as Windows-style paths with back slashes (${backSlash}) and absolute paths will work on some platforms, but they are not portable and will not work for users on other platforms.

        Defaults to the Deploy action's config's directory if no value is provided.
        `
    )
    .example("src")
)
export const syncTargetPathSchema = memoize(() =>
  joi
    .posixPath()
    .absoluteOnly()
    .required()
    .invalid("/")
    .description(
      deline`
      POSIX-style absolute path to sync to inside the container. The root path (i.e. "/") is not allowed.
      `
    )
    .example("/app/src")
)

const containerSyncSchema = createSchema({
  name: "container-sync",
  keys: () => ({
    source: syncSourcePathSchema(),
    target: syncTargetPathSchema(),
    exclude: syncExcludeSchema(),
    mode: syncModeSchema(),
    defaultFileMode: syncDefaultFileModeSchema(),
    defaultDirectoryMode: syncDefaultDirectoryModeSchema(),
    defaultOwner: syncDefaultOwnerSchema(),
    defaultGroup: syncDefaultGroupSchema(),
  }),
})

export interface ContainerSyncSpec {
  args?: string[]
  command?: string[]
  paths: DevModeSyncSpec[]
}

export const containerSyncPathSchema = createSchema({
  name: "container-sync-path",
  description: dedent`
    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in sync mode, and overrides for the container command and/or arguments.

    Sync is enabled e.g. by setting the \`--sync\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${syncGuideLink}) for more information.
  `,
  keys: () => ({
    args: joi
      .sparseArray()
      .items(joi.string())
      .description("Override the default container arguments when in sync mode."),
    command: joi
      .sparseArray()
      .items(joi.string())
      .description("Override the default container command (i.e. entrypoint) when in sync mode."),
    paths: joi
      .array()
      .items(containerSyncSchema())
      .description("Specify one or more source files or directories to automatically sync with the running container."),
  }),
  rename: [["sync", "paths"]],
})

const defaultLocalModeRestartDelayMsec = 1000
const defaultLocalModeMaxRestarts = Number.POSITIVE_INFINITY

export const localModeRestartSchema = createSchema({
  name: "local-mode-restart",
  description: `Specifies restarting policy for the local application. By default, the local application will be restarting infinitely with ${defaultLocalModeRestartDelayMsec}ms between attempts.`,
  keys: () => ({
    delayMsec: joi
      .number()
      .integer()
      .greater(-1)
      .optional()
      .default(defaultLocalModeRestartDelayMsec)
      .description(
        `Delay in milliseconds between the local application restart attempts. The default value is ${defaultLocalModeRestartDelayMsec}ms.`
      ),
    max: joi
      .number()
      .integer()
      .greater(-1)
      .optional()
      .default(defaultLocalModeMaxRestarts)
      .allow(defaultLocalModeMaxRestarts)
      .description("Max number of the local application restarts. Unlimited by default."),
  }),
  options: { presence: "optional" },
  default: {
    delayMsec: defaultLocalModeRestartDelayMsec,
    max: defaultLocalModeMaxRestarts,
  },
})

export const localModePortsSchema = createSchema({
  name: "local-mode-port",
  keys: () => ({
    local: joi
      .number()
      .integer()
      .greater(0)
      .optional()
      .description("The local port to be used for reverse port-forward."),
    remote: joi
      .number()
      .integer()
      .greater(0)
      .optional()
      .description("The remote port to be used for reverse port-forward."),
  }),
})

export const containerLocalModeSchema = createSchema({
  name: "container-local-mode",
  description: `This feature has been deleted.`,
  keys: () => ({
    ports: joi
      .array()
      .items(localModePortsSchema())
      .description("The reverse port-forwards configuration for the local application."),
    command: joi
      .sparseArray()
      .optional()
      .items(joi.string())
      .description(
        "The command to run the local application. If not present, then the local application should be started manually."
      ),
    restart: localModeRestartSchema(),
  }),
  meta: {
    deprecated: makeDeprecationMessage({ deprecation: "localMode" }),
  },
})

const annotationsSchema = memoize(() =>
  joiStringMap(joi.string())
    .example({ "nginx.ingress.kubernetes.io/proxy-body-size": "0" })
    .default(() => ({}))
)

export interface EnvSecretRef {
  secretRef: {
    name: string
    key?: string
  }
}

const secretRefSchema = createSchema({
  name: "container-secret-ref",
  description:
    "A reference to a secret, that should be applied to the environment variable. " +
    "Note that this secret must already be defined in the provider.",
  keys: () => ({
    secretRef: joi.object().keys({
      name: joi.string().required().description("The name of the secret to refer to."),
      key: joi
        .string()
        .description("The key to read from in the referenced secret. May be required for some providers."),
    }),
  }),
})

export interface ContainerEnvVars {
  [key: string]: Primitive | EnvSecretRef
}

export const containerEnvVarsSchema = memoize(() =>
  joi
    .object()
    .pattern(envVarRegex, joi.alternatives(joiPrimitive(), secretRefSchema()))
    .default(() => ({}))
    .unknown(false)
    .description(
      "Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
        "(must not start with `GARDEN`) and values must be primitives or references to secrets."
    )
    .example([
      {
        MY_VAR: "some-value",
        MY_SECRET_VAR: { secretRef: { name: "my-secret", key: "some-key" } },
      },
      {},
    ])
)

const ingressSchema = createSchema({
  name: "container-ingress",
  keys: () => ({
    annotations: annotationsSchema().description(
      "Annotations to attach to the ingress (Note: May not be applicable to all providers)"
    ),
    hostname: ingressHostnameSchema(),
    linkUrl: linkUrlSchema(),
    path: joi.string().default("/").description("The path which should be routed to the service."),
    port: joi
      .string()
      .required()
      .description("The name of the container port where the specified paths should be routed."),
  }),
})

const healthCheckSchema = createSchema({
  name: "container-health-check",
  keys: () => ({
    httpGet: joi
      .object()
      .keys({
        path: joi
          .string()
          .uri(<any>{ relativeOnly: true })
          .required()
          .description("The path of the service's health check endpoint."),
        port: joi
          .string()
          .required()
          .description("The name of the port where the service's health check endpoint should be available."),
        scheme: joi.string().allow("HTTP", "HTTPS").default("HTTP"),
      })
      .description("Set this to check the service's health by making an HTTP request."),
    command: joi
      .sparseArray()
      .items(joi.string())
      .description("Set this to check the service's health by running a command in its container."),
    tcpPort: joi
      .string()
      .description("Set this to check the service's health by checking if this TCP port is accepting connections."),
    readinessTimeoutSeconds: joi
      .number()
      .min(1)
      .default(3)
      .description("The maximum number of seconds to wait until the readiness check counts as failed."),
    livenessTimeoutSeconds: joi
      .number()
      .min(1)
      .default(3)
      .description("The maximum number of seconds to wait until the liveness check counts as failed."),
  }),
  xor: [["httpGet", "command", "tcpPort"]],
})

const limitsSchema = createSchema({
  name: "container-limits",
  keys: () => ({
    cpu: joi
      .number()
      .min(10)
      .description("The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)")
      .meta({ deprecated: true }), // TODO(deprecation): deprecate in 0.14
    memory: joi
      .number()
      .min(64)
      .description("The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)")
      .meta({ deprecated: true }), // TODO(deprecation): deprecate in 0.14
  }),
})

export const containerCpuSchema = () =>
  joi.object().keys({
    min: joi.number().default(defaultContainerResources.cpu.min).description(deline`
        The minimum amount of CPU the container needs to be available for it to be deployed, in millicpus
        (i.e. 1000 = 1 CPU)
      `),
    max: joi.number().default(defaultContainerResources.cpu.max).min(defaultContainerResources.cpu.min).allow(null)
      .description(deline`
        The maximum amount of CPU the container can use, in millicpus (i.e. 1000 = 1 CPU).
        If set to null will result in no limit being set.
      `),
  })

export const containerMemorySchema = createSchema({
  name: "container-memory",
  keys: () => ({
    min: joi.number().default(defaultContainerResources.memory.min).description(deline`
        The minimum amount of RAM the container needs to be available for it to be deployed, in megabytes
        (i.e. 1024 = 1 GB)
      `),
    max: joi.number().default(defaultContainerResources.memory.max).allow(null).min(64).description(deline`
        The maximum amount of RAM the container can use, in megabytes (i.e. 1024 = 1 GB)
        If set to null will result in no limit being set.
      `),
  }),
})

export const portSchema = createSchema({
  name: "container-port",
  keys: () => ({
    name: joiUserIdentifier()
      .required()
      .description("The name of the port (used when referencing the port elsewhere in the service configuration)."),
    protocol: joi.string().allow("TCP", "UDP").default(DEFAULT_PORT_PROTOCOL).description("The protocol of the port."),
    containerPort: joi.number().required().example(8080).description(deline`
        The port exposed on the container by the running process. This will also be the default value
        for \`servicePort\`.

        This is the port you would expose in your Dockerfile and that your process listens on.
        This is commonly a non-privileged port like 8080 for security reasons.

        The service port maps to the container port:

        \`servicePort:80 -> containerPort:8080 -> process:8080\``),
    localPort: joi
      .number()
      .example(10080)
      .description(
        dedent`
        Specify a preferred local port to attach to when creating a port-forward to the service port. If this port is
        busy, a warning will be shown and an alternative port chosen.
        `
      ),
    servicePort: joi
      .number()
      .default((context) => context.containerPort)
      .example(80).description(deline`
        The port exposed on the service.
        Defaults to \`containerPort\` if not specified.

        This is the port you use when calling a service from another service within the cluster.
        For example, if your service name is my-service and the service port is 8090,
        you would call it with: http://my-service:8090/some-endpoint.

        It is common to use port 80, the default port number, so that you can call the service
        directly with http://my-service/some-endpoint.

        The service port maps to the container port:

        \`servicePort:80 -> containerPort:8080 -> process:8080\``),
    hostPort: joi.number().meta({ deprecated: true }),
    nodePort: joi.number().allow(true).description(deline`
        Set this to expose the service on the specified port on the host node (may not be supported by all providers).
        Set to \`true\` to have the cluster pick a port automatically, which is most often advisable if the cluster is
        shared by multiple users.

        This allows you to call the service from the outside by the node's IP address
        and the port number set in this field.
      `),
  }),
})

export const volumeSchemaBase = createSchema({
  name: "container-volume-base",
  keys: () => ({
    name: joiUserIdentifier().required().description("The name of the allocated volume."),
    containerPath: joi
      .posixPath()
      .required()
      .description("The path where the volume should be mounted in the container."),
    hostPath: joi
      .posixPath()
      .description(
        dedent`
        _NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms and providers. Some providers may not support it at all._

        A local path or path on the node that's running the container, to mount in the container, relative to the config source directory (or absolute).
      `
      )
      .example("/some/dir"),
  }),
})

export function getContainerVolumesSchema(schema: Joi.ObjectSchema) {
  return joiSparseArray(schema).unique("name").description(dedent`
    List of volumes that should be mounted when starting the container.

    Note: If neither \`hostPath\` nor \`action\` is specified,
    an empty ephemeral volume is created and mounted when deploying the container.
  `)
}

const containerPrivilegedSchema = memoize(() =>
  joi
    .boolean()
    .optional()
    .description(
      `If true, run the main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.`
    )
)

const containerAddCapabilitiesSchema = memoize(() =>
  joi.sparseArray().items(joi.string()).optional().description(`POSIX capabilities to add when running the container.`)
)

const containerDropCapabilitiesSchema = memoize(() =>
  joi
    .sparseArray()
    .items(joi.string())
    .optional()
    .description(`POSIX capabilities to remove when running the container.`)
)

interface ContainerCommonRuntimeSpec {
  args: string[]
  command?: string[]
  env: PrimitiveMap

  limits?: ServiceLimitSpec
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]

  privileged?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}

// Passed to ContainerServiceSpec
export interface ContainerCommonDeploySpec extends ContainerCommonRuntimeSpec {
  annotations: Annotations
  daemon: boolean
  sync?: ContainerSyncSpec
  ingresses: ContainerIngressSpec[]
  healthCheck?: ServiceHealthCheckSpec
  timeout?: number
  ports: ServicePortSpec[]
  replicas?: number
  tty?: boolean
  deploymentStrategy: DeploymentStrategy
}

export interface ContainerDeploySpec extends ContainerCommonDeploySpec {
  volumes: ContainerVolumeSpec[]
  image?: string
}

export type ContainerDeployActionConfig = DeployActionConfig<"container", ContainerDeploySpec>

export type ContainerDeployOutputs = {
  deployedImageId: string
}

export const containerDeployOutputsSchema = createSchema({
  name: "container-deploy-outputs",
  keys: () => ({
    deployedImageId: joi.string().required().description("The ID of the image that was deployed."),
  }),
})

export type ContainerDeployAction = DeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>

const containerCommonRuntimeSchemaKeys = memoize(() => ({
  command: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The command/entrypoint to run the container with.")
    .example(commandExample),
  args: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The arguments (on top of the `command`, i.e. entrypoint) to run the container with.")
    .example(["npm", "start"]),
  env: containerEnvVarsSchema(),
  cpu: containerCpuSchema().default(defaultContainerResources.cpu),
  memory: containerMemorySchema().default(defaultContainerResources.memory),
  volumes: getContainerVolumesSchema(volumeSchemaBase()),
  privileged: containerPrivilegedSchema(),
  addCapabilities: containerAddCapabilitiesSchema(),
  dropCapabilities: containerDropCapabilitiesSchema(),
  tty: joi
    .boolean()
    .default(false)
    .description(
      "Specify if containers in this action have TTY support enabled (which implies having stdin support enabled)."
    ),
  deploymentStrategy: joi
    .string()
    .default(defaultDeploymentStrategy)
    .valid(...deploymentStrategies)
    .description("Specifies the container's deployment strategy."),
}))

const containerImageSchema = memoize(() =>
  joi.string().required().description(deline`
    Specify an image ID to deploy. Should be a valid Docker image identifier. Required.
  `)
)

export const containerDeploySchemaKeys = memoize(() => ({
  ...containerCommonRuntimeSchemaKeys(),
  annotations: annotationsSchema().description(
    dedent`
    Annotations to attach to the service _(note: May not be applicable to all providers)_.

    When using the Kubernetes provider, these annotations are applied to both Service and Pod resources. You can generally specify the annotations intended for both Pods or Services here, and the ones that don't apply on either side will be ignored (i.e. if you put a Service annotation here, it'll also appear on Pod specs but will be safely ignored there, and vice versa).
    `
  ),
  daemon: joi.boolean().default(false).description(deline`
      Whether to run the service as a daemon (to ensure exactly one instance runs per node).
      May not be supported by all providers.
    `),
  sync: containerSyncPathSchema(),
  localMode: containerLocalModeSchema(),
  image: containerImageSchema(),
  ingresses: joiSparseArray(ingressSchema())
    .description("List of ingress endpoints that the service exposes.")
    .example([{ path: "/api", port: "http" }]),
  healthCheck: healthCheckSchema().description("Specify how the service's health should be checked after deploying."),
  // TODO(deprecation): deprecate in 0.14
  hotReload: joi.any().meta({ internal: true }),
  timeout: k8sDeploymentTimeoutSchema(),
  limits: limitsSchema()
    .description("Specify resource limits for the service.")
    .meta({ deprecated: "Please use the `cpu` and `memory` fields instead." }), // TODO(deprecation): deprecate in 0.14
  ports: joiSparseArray(portSchema()).unique("name").description("List of ports that the service container exposes."),
  replicas: joi.number().integer().description(deline`
    The number of instances of the service to deploy.
    Defaults to 3 for environments configured with \`production: true\`, otherwise 1.

    Note: This setting may be overridden or ignored in some cases. For example, when running with \`daemon: true\` or if the provider doesn't support multiple replicas.
  `),
}))

export const containerDeploySchema = createSchema({
  name: "container-deploy",
  keys: containerDeploySchemaKeys,
  // TODO(deprecation): deprecate in 0.14 - the old devMode syntax must be deprecated
  rename: [["devMode", "sync"]],
  meta: { name: "container-deploy" },
})

export interface ContainerRegistryConfig {
  hostname: string
  port?: number
  namespace?: string
  insecure: boolean
}

export const containerRegistryConfigSchema = createSchema({
  name: "container-registry-config",
  keys: () => ({
    hostname: joi
      .string()
      .required()
      .description("The hostname (and optionally port, if not the default port) of the registry.")
      .example("gcr.io"),
    port: joi.number().integer().description("The port where the registry listens on, if not the default."),
    namespace: joi
      .string()
      .optional()
      .description(
        "The registry namespace. Will be placed between hostname and image name, like so: <hostname>/<namespace>/<image name>"
      )
      .example("my-project"),
    insecure: joi
      .boolean()
      .default(false)
      .description("Set to true to allow insecure connections to the registry (without SSL)."),
  }),
})

// TEST //

export const artifactsDescription = dedent`
Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
the \`.garden/artifacts\` directory.
`

export const containerArtifactSchema = createSchema({
  name: "container-artifact",
  keys: () => ({
    source: joi
      .posixPath()
      .allowGlobs()
      .absoluteOnly()
      .required()
      .description("A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.")
      .example("/output/**/*"),
    target: joi
      .posixPath()
      .relativeOnly()
      .subPathOnly()
      .default(".")
      .description(artifactsTargetDescription)
      .example("outputs/foo/"),
  }),
})

const artifactsSchema = memoize(() =>
  joi
    .array()
    .items(containerArtifactSchema())
    .description(
      deline`
    ${artifactsDescription}\n

    Note: Depending on the provider, this may require the container image to include \`sh\` \`tar\`, in order
    to enable the file transfer.
  `
    )
    .example([{ source: "/report/**/*" }])
)

export type ContainerTestOutputs = {
  log: string
}

export const containerTestOutputSchema = createSchema({
  name: "container-test-output",
  keys: () => ({
    log: joi
      .string()
      .allow("")
      .default("")
      .description(
        "The full log output from the executed action. (Pro-tip: Make it machine readable so it can be parsed by dependants)"
      ),
  }),
})

export interface ContainerTestActionSpec extends ContainerCommonRuntimeSpec {
  artifacts: ArtifactSpec[]
  image?: string
  volumes: ContainerVolumeSpec[]
  cacheResult: boolean
}

export type ContainerTestActionConfig = TestActionConfig<"container", ContainerTestActionSpec>
export type ContainerTestAction = TestAction<ContainerTestActionConfig, ContainerTestOutputs>

export const containerRunAndTestSpecKeys = memoize((kind: ActionKind) => ({
  ...containerCommonRuntimeSchemaKeys(),
  artifacts: artifactsSchema(),
  image: containerImageSchema(),
  cacheResult: runCacheResultSchema(kind),
}))

export const containerTestSpecKeys = memoize(() => ({
  ...containerRunAndTestSpecKeys("Test"),
}))

export const containerTestActionSchema = createSchema({
  name: "container:Test",
  keys: containerTestSpecKeys,
})

// RUN //

export type ContainerRunOutputs = ContainerTestOutputs

export const containerRunOutputSchema = () => containerTestOutputSchema()

export type ContainerRunActionSpec = ContainerTestActionSpec

export type ContainerRunActionConfig = RunActionConfig<"container", ContainerRunActionSpec>
export type ContainerRunAction = RunAction<ContainerRunActionConfig, ContainerRunOutputs>

export const containerRunSpecKeys = memoize(() => ({
  ...containerRunAndTestSpecKeys("Run"),
}))

export const containerRunActionSchema = createSchema({
  name: "container:Run",
  keys: containerRunSpecKeys,
})

// BUILD //

export type ContainerBuildOutputs = {
  "localImageName": string
  "localImageId": string
  "deploymentImageName": string
  "deploymentImageId": string

  // Aliases, for backwards compatibility.
  // TODO: remove in 0.14
  "local-image-name": string
  "local-image-id": string
  "deployment-image-name": string
  "deployment-image-id": string
}

export const containerBuildOutputSchemaKeys = memoize(() => ({
  "localImageName": joi
    .string()
    .required()
    .description("The name of the image (without tag/version) that the Build uses for local builds and deployments.")
    .example("my-build"),
  "localImageId": joi
    .string()
    .required()
    .description("The full ID of the image (incl. tag/version) that the Build uses for local builds and deployments.")
    .example("my-build:v-abf3f8dca"),
  "deploymentImageName": joi
    .string()
    .required()
    .description("The name of the image (without tag/version) that the Build will use during deployment.")
    .example("my-deployment-registry.io/my-org/my-build"),
  "deploymentImageId": joi
    .string()
    .required()
    .description("The full ID of the image (incl. tag/version) that the Build will use during deployment.")
    .example("my-deployment-registry.io/my-org/my-build:v-abf3f8dca"),

  // Aliases
  "local-image-name": joi.string().required().description("Alias for localImageName, for backward compatibility."),
  "local-image-id": joi.string().required().description("Alias for localImageId, for backward compatibility."),
  "deployment-image-name": joi
    .string()
    .required()
    .description("Alias for deploymentImageName, for backward compatibility."),
  "deployment-image-id": joi
    .string()
    .required()
    .description("Alias for deploymentImageId, for backward compatibility."),
}))

export const containerBuildOutputsSchema = createSchema({
  name: "container:Build:outputs",
  keys: containerBuildOutputSchemaKeys,
})

export interface ContainerBuildActionSpec {
  buildArgs: PrimitiveMap
  dockerfile: string
  extraFlags: string[]
  secrets?: Record<string, Secret>
  localId?: string
  publishId?: string
  targetStage?: string
  platforms?: string[]
}

export type ContainerBuildActionConfig = BuildActionConfig<"container", ContainerBuildActionSpec>
export type ContainerBuildAction = BuildAction<ContainerBuildActionConfig, ContainerBuildOutputs, {}>

export const containerBuildSpecKeys = memoize(() => ({
  localId: joi
    .string()
    .allow(false, null)
    .empty([false, null])
    .description(
      deline`
      Specify an image ID to use when building locally, instead of the default of using the action name. Must be a valid Docker image identifier. **Note that the image _tag_ is always set to the action version.**
      `
    ),
  publishId: joi
    .string()
    .allow(false, null)
    .empty([false, null])
    .description(
      deline`
      Specify an image ID to use when publishing the image (via the \`garden publish\` command), instead of the default of using the action name. Must be a valid Docker image identifier.
      `
    ),
  targetStage: joi.string().description(deline`
    For multi-stage Dockerfiles, specify which image/stage to build (see
    https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for
    details).
  `),
}))

export const containerCommonBuildSpecKeys = memoize(() => ({
  buildArgs: joi
    .object()
    .pattern(/.+/, joiPrimitive())
    .default(() => ({})).description(dedent`
      Specify build arguments to use when building the container image.

      Note: Garden will always set a \`GARDEN_ACTION_VERSION\` (alias \`GARDEN_MODULE_VERSION\`) argument with the module/build version at build time.
    `),
  extraFlags: joi.sparseArray().items(joi.string()).description(deline`
    Specify extra flags to use when building the container image.
    Note that arguments may not be portable across implementations.`),
  platforms: joi.sparseArray().items(joi.string()).description(dedent`
      Specify the platforms to build the image for. This is useful when building multi-platform images.
      The format is \`os/arch\`, e.g. \`linux/amd64\`, \`linux/arm64\`, etc.
    `),
  secrets: joi
    .object()
    .pattern(/.+/, joi.string().custom(makeSecret))
    .description(
      dedent`
      Secret values that can be mounted in the Dockerfile, but do not become part of the image filesystem or image manifest. This is useful e.g. for private registry auth tokens.

      Build arguments and environment variables are inappropriate for secrets, as they persist in the final image.

      The secret can later be consumed in the Dockerfile like so:
      \`\`\`
        RUN --mount=type=secret,id=mytoken \
            TOKEN=$(cat /run/secrets/mytoken) ...
      \`\`\`

      See also https://docs.docker.com/build/building/secrets/
    `
    )
    .example({
      mytoken: "supersecret",
    }),
}))

export const containerBuildSpecSchema = createSchema({
  name: "container:Build",
  keys: () => ({
    ...containerBuildSpecKeys(),
    ...containerCommonBuildSpecKeys(),
    dockerfile: joi
      .posixPath()
      .subPathOnly()
      .default(defaultDockerfileName)
      .description("POSIX-style name of a Dockerfile, relative to the action's source root."),
    targetStage: joi.string().description(deline`
      For multi-stage Dockerfiles, specify which image/stage to build (see
      https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for
      details).
    `),
    // TODO: remove in 0.14, keeping around to avoid config failures
    hotReload: joi.any().meta({ internal: true }),
  }),
})

export type ContainerActionConfig =
  | ContainerDeployActionConfig
  | ContainerRunActionConfig
  | ContainerTestActionConfig
  | ContainerBuildActionConfig

export type ContainerRuntimeAction = ContainerDeployAction | ContainerRunAction | ContainerTestAction
export type ContainerRuntimeActionConfig =
  | ContainerDeployActionConfig
  | ContainerRunActionConfig
  | ContainerTestActionConfig
