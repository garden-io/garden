/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  artifactsTargetDescription,
  envVarRegex,
  joi,
  joiPrimitive,
  joiSparseArray,
  joiStringMap,
  joiUserIdentifier,
  Primitive,
  PrimitiveMap,
  CustomObjectSchema,
} from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { ingressHostnameSchema, linkUrlSchema } from "../../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../../constants"
import { cacheResultSchema } from "../../config/task"
import { dedent, deline } from "../../util/string"
import { devModeGuideLink } from "../kubernetes/dev-mode"
import { k8sDeploymentTimeoutSchema } from "../kubernetes/config"
import { localModeGuideLink } from "../kubernetes/local-mode"
import { BuildAction, BuildActionConfig } from "../../actions/build"
import { DeployAction, DeployActionConfig } from "../../actions/deploy"
import { TestAction, TestActionConfig } from "../../actions/test"
import { RunAction, RunActionConfig } from "../../actions/run"
import { defaultDockerfileName } from "./helpers"
import { baseServiceSpecSchema } from "../../config/service"

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

export interface ContainerVolumeSpec extends ContainerVolumeSpecBase {
  action?: string
}

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
    max: number
  }
  memory: {
    min: number
    max: number
  }
}

interface Annotations {
  [name: string]: string
}

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

export const defaultDevModeSyncMode: SyncMode = "one-way-safe"

export interface DevModeSyncOptions {
  mode?: SyncMode
  exclude?: string[]
  defaultFileMode?: number
  defaultDirectoryMode?: number
  defaultOwner?: number | string
  defaultGroup?: number | string
}

interface DevModeSyncSpec extends DevModeSyncOptions {
  source: string
  target: string
}

const permissionsDocs =
  "See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information."

const ownerDocs =
  "Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information."

export const syncExcludeSchema = () =>
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

export const syncModeSchema = () =>
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
    .default(defaultDevModeSyncMode)
    .description(
      "The sync mode to use for the given paths. See the [Dev Mode guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for details."
    )

export const syncDefaultFileModeSchema = () =>
  joi
    .number()
    .min(0)
    .max(0o777)
    .description(
      "The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600 (user read/write). " +
        permissionsDocs
    )

export const syncDefaultDirectoryModeSchema = () =>
  joi
    .number()
    .min(0)
    .max(0o777)
    .description(
      "The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0700 (user read/write). " +
        permissionsDocs
    )

export const syncDefaultOwnerSchema = () =>
  joi
    .alternatives(joi.number().integer(), joi.string())
    .description("Set the default owner of files and directories at the target. " + ownerDocs)

export const syncDefaultGroupSchema = () =>
  joi
    .alternatives(joi.number().integer(), joi.string())
    .description("Set the default group on files and directories at the target. " + ownerDocs)

export const syncTargetPathSchema = () =>
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

const devModeSyncSchema = () =>
  joi.object().keys({
    source: joi
      .posixPath()
      .relativeOnly()
      .subPathOnly()
      .allowGlobs()
      .default(".")
      .description(
        deline`
        POSIX-style path of the directory to sync to the target, relative to the config's directory.
        Must be a relative path. Defaults to the config's directory if no value is provided.`
      )
      .example("src"),
    target: syncTargetPathSchema(),
    exclude: syncExcludeSchema(),
    mode: syncModeSchema(),
    defaultFileMode: syncDefaultFileModeSchema(),
    defaultDirectoryMode: syncDefaultDirectoryModeSchema(),
    defaultOwner: syncDefaultOwnerSchema(),
    defaultGroup: syncDefaultGroupSchema(),
  })

export interface ContainerDevModeSpec {
  args?: string[]
  command?: string[]
  sync: DevModeSyncSpec[]
}

export const containerDevModeSchema = () =>
  joi.object().keys({
    args: joi
      .sparseArray()
      .items(joi.string())
      .description("Override the default container arguments when in dev mode."),
    command: joi
      .sparseArray()
      .items(joi.string())
      .description("Override the default container command (i.e. entrypoint) when in dev mode."),
    sync: joi
      .array()
      .items(devModeSyncSchema())
      .description("Specify one or more source files or directories to automatically sync with the running container."),
  }).description(dedent`
    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${devModeGuideLink}) for more information.
  `)

const defaultLocalModeRestartDelayMsec = 1000
const defaultLocalModeMaxRestarts = Number.POSITIVE_INFINITY

export interface LocalModeRestartSpec {
  delayMsec: number
  max: number
}

export const localModeRestartSchema = () =>
  joi
    .object()
    .keys({
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
        .description("Max number of the local application restarts. Unlimited by default."),
    })
    .optional()
    .default({
      delayMsec: defaultLocalModeRestartDelayMsec,
      max: defaultLocalModeMaxRestarts,
    })
    .description(
      `Specifies restarting policy for the local application. By default, the local application will be restarting infinitely with ${defaultLocalModeRestartDelayMsec}ms between attempts.`
    )

export interface ContainerLocalModeSpec {
  localPort: number
  command?: string[]
  restart: LocalModeRestartSpec
}

export const containerLocalModeSchema = () =>
  joi.object().keys({
    localPort: joi.number().description("The working port of the local application."),
    command: joi
      .sparseArray()
      .optional()
      .items(joi.string())
      .description(
        "The command to run the local application. If not present, then the local application should be started manually."
      ),
    restart: localModeRestartSchema(),
  }).description(dedent`
    Configures the local application which will send and receive network requests instead of the target resource.

    The target service will be replaced by a proxy container which runs an SSH server to proxy requests.
    Reverse port-forwarding will be automatically configured to route traffic to the local service and back.

    Local mode is enabled by setting the \`--local\` option on the \`garden deploy\` or \`garden dev\` commands.
    Local mode always takes the precedence over dev mode if there are any conflicting service names.

    Health checks are disabled for services running in local mode.

    See the [Local Mode guide](${localModeGuideLink}) for more information.
  `)

const annotationsSchema = () =>
  joiStringMap(joi.string())
    .example({ "nginx.ingress.kubernetes.io/proxy-body-size": "0" })
    .default(() => ({}))

export interface EnvSecretRef {
  secretRef: {
    name: string
    key?: string
  }
}

const secretRefSchema = () =>
  joi
    .object()
    .keys({
      secretRef: joi.object().keys({
        name: joi.string().required().description("The name of the secret to refer to."),
        key: joi
          .string()
          .description("The key to read from in the referenced secret. May be required for some providers."),
      }),
    })
    .description(
      "A reference to a secret, that should be applied to the environment variable. " +
        "Note that this secret must already be defined in the provider."
    )

export interface ContainerEnvVars {
  [key: string]: Primitive | EnvSecretRef
}

export const containerEnvVarsSchema = () =>
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

const ingressSchema = () =>
  joi.object().keys({
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
  })

const healthCheckSchema = () =>
  joi
    .object()
    .keys({
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
    })
    .xor("httpGet", "command", "tcpPort")

const limitsSchema = () =>
  joi.object().keys({
    cpu: joi
      .number()
      .min(10)
      .description("The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)")
      .meta({ deprecated: true }),
    memory: joi
      .number()
      .min(64)
      .description("The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)")
      .meta({ deprecated: true }),
  })

export const containerCpuSchema = () =>
  joi.object().keys({
    min: joi.number().default(defaultContainerResources.cpu.min).description(deline`
          The minimum amount of CPU the container needs to be available for it to be deployed, in millicpus
          (i.e. 1000 = 1 CPU)
        `),
    max: joi
      .number()
      .default(defaultContainerResources.cpu.max)
      .min(10)
      .description(`The maximum amount of CPU the container can use, in millicpus (i.e. 1000 = 1 CPU)`),
  })

export const containerMemorySchema = () =>
  joi.object().keys({
    min: joi.number().default(defaultContainerResources.memory.min).description(deline`
        The minimum amount of RAM the container needs to be available for it to be deployed, in megabytes
        (i.e. 1024 = 1 GB)
      `),
    max: joi
      .number()
      .default(defaultContainerResources.memory.min)
      .min(64)
      .description(`The maximum amount of RAM the container can use, in megabytes (i.e. 1024 = 1 GB)`),
  })

export const portSchema = () =>
  joi.object().keys({
    name: joiUserIdentifier()
      .required()
      .description("The name of the port (used when referencing the port elsewhere in the service configuration)."),
    protocol: joi.string().allow("TCP", "UDP").default(DEFAULT_PORT_PROTOCOL).description("The protocol of the port."),
    containerPort: joi.number().required().example(8080).description(deline`
        The port exposed on the container by the running process. This will also be the default value
        for \`servicePort\`.

        This is the port you would expose in your Dockerfile and that your process listens on.
        This is commonly a non-priviledged port like 8080 for security reasons.

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
  })

export const volumeSchemaBase = () =>
  joi.object().keys({
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
  })

const volumeSchema = () =>
  volumeSchemaBase()
    .keys({
      // TODO-0.13: remove when kubernetes-container type is ready, better to swap out with raw k8s references
      action: joi
        .actionReference()
        .kind("Deploy")
        .name("base-volume")
        .description(
          dedent`
          The name of a _volume Deploy action_ that should be mounted at \`containerPath\`. The supported action types are [persistentvolumeclaim](./persistentvolumeclaim.md) and [configmap](./configmap.md), for example.

          Note: Make sure to pay attention to the supported \`accessModes\` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.
          `
        ),
    })
    .oxor("hostPath", "action")

export function getContainerVolumesSchema(schema: CustomObjectSchema) {
  return joiSparseArray(schema).unique("name").description(dedent`
    List of volumes that should be mounted when starting the container.

    Note: If neither \`hostPath\` nor \`module\` is specified, an empty ephemeral volume is created and mounted when deploying the container.
  `)
}

const containerPrivilegedSchema = () =>
  joi
    .boolean()
    .optional()
    .description(
      `If true, run the main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.`
    )

const containerAddCapabilitiesSchema = () =>
  joi.sparseArray().items(joi.string()).optional().description(`POSIX capabilities to add when running the container.`)

const containerDropCapabilitiesSchema = () =>
  joi
    .sparseArray()
    .items(joi.string())
    .optional()
    .description(`POSIX capabilities to remove when running the container.`)

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
  devMode?: ContainerDevModeSpec
  localMode?: ContainerLocalModeSpec
  ingresses: ContainerIngressSpec[]
  healthCheck?: ServiceHealthCheckSpec
  timeout?: number
  ports: ServicePortSpec[]
  replicas?: number
  tty?: boolean
}

export interface ContainerDeploySpec extends ContainerCommonDeploySpec {
  volumes: ContainerVolumeSpec[]
  image?: string
}
export type ContainerDeployActionConfig = DeployActionConfig<"container", ContainerDeploySpec>

export interface ContainerDeployOutputs {
  deployedImageId: string
}

export const containerDeployOutputsSchema = () =>
  joi.object().keys({
    deployedImageId: joi.string().required().description("The ID of the image that was deployed."),
  })

export type ContainerDeployAction = DeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>

const containerCommonRuntimeSchemaKeys = () => ({
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
  volumes: getContainerVolumesSchema(volumeSchema()),
  privileged: containerPrivilegedSchema(),
  addCapabilities: containerAddCapabilitiesSchema(),
  dropCapabilities: containerDropCapabilitiesSchema(),
  tty: joi
    .boolean()
    .default(false)
    .description(
      "Specify if containers in this module have TTY support enabled (which implies having stdin support enabled)."
    ),
})

export const containerDeploySchema = () =>
  baseServiceSpecSchema().keys({
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
    devMode: containerDevModeSchema(),
    localMode: containerLocalModeSchema(),
    image: joi.string().allow(false, null).empty([false, null]).description(deline`
    Specify an image ID to deploy. Should be a valid Docker image identifier. Required if no \`build\` is specified.
  `),
    ingresses: joiSparseArray(ingressSchema())
      .description("List of ingress endpoints that the service exposes.")
      .example([{ path: "/api", port: "http" }]),
    healthCheck: healthCheckSchema().description("Specify how the service's health should be checked after deploying."),
    // TODO: remove in 0.14, keeping around to avoid config failures
    hotReload: joi.any().meta({ internal: true }),
    timeout: k8sDeploymentTimeoutSchema(),
    limits: limitsSchema()
      .description("Specify resource limits for the service.")
      .meta({ deprecated: "Please use the `cpu` and `memory` fields instead." }),
    ports: joiSparseArray(portSchema()).unique("name").description("List of ports that the service container exposes."),
    replicas: joi.number().integer().description(deline`
    The number of instances of the service to deploy.
    Defaults to 3 for environments configured with \`production: true\`, otherwise 1.

    Note: This setting may be overridden or ignored in some cases. For example, when running with \`daemon: true\` or if the provider doesn't support multiple replicas.
  `),
  })

export interface ContainerRegistryConfig {
  hostname: string
  port?: number
  namespace: string
}

export const containerRegistryConfigSchema = () =>
  joi.object().keys({
    hostname: joi
      .string()
      .required()
      .description("The hostname (and optionally port, if not the default port) of the registry.")
      .example("gcr.io"),
    port: joi.number().integer().description("The port where the registry listens on, if not the default."),
    namespace: joi
      .string()
      .default("_")
      .description("The namespace in the registry where images should be pushed.")
      .example("my-project"),
  }).description(dedent`
    The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

    Important: If you specify this in combination with in-cluster building, you must make sure \`imagePullSecrets\` includes authentication with the specified deployment registry, that has the appropriate write privileges (usually full write access to the configured \`deploymentRegistry.namespace\`).
  `)

// TEST //

export const artifactsDescription = dedent`
Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
the \`.garden/artifacts\` directory.
`

export const containerArtifactSchema = () =>
  joi.object().keys({
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
  })

const artifactsSchema = () =>
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

export interface ContainerTestOutputs {
  log: string
}
export const containerTestOutputSchema = () =>
  joi.object().keys({
    log: joi
      .string()
      .allow("")
      .default("")
      .description(
        "The full log output from the executed action. (Pro-tip: Make it machine readable so it can be parsed by dependants)"
      ),
  })

export interface ContainerTestActionSpec extends ContainerCommonRuntimeSpec {
  artifacts: ArtifactSpec[]
  image?: string
  volumes: ContainerVolumeSpec[]
}
export type ContainerTestActionConfig = TestActionConfig<"container", ContainerTestActionSpec>
export type ContainerTestAction = TestAction<ContainerTestActionConfig, ContainerTestOutputs>

export const containerTestSpecKeys = () => ({
  ...containerCommonRuntimeSchemaKeys(),
  artifacts: artifactsSchema(),
})

export const containerTestActionSchema = () => joi.object().keys(containerTestSpecKeys())

// RUN //

export interface ContainerRunOutputs extends ContainerTestOutputs {}
export const containerRunOutputSchema = () => containerTestOutputSchema()

export interface ContainerRunActionSpec extends ContainerTestActionSpec {
  cacheResult: boolean
}
export type ContainerRunActionConfig = RunActionConfig<"container", ContainerRunActionSpec>
export type ContainerRunAction = RunAction<ContainerRunActionConfig, ContainerRunOutputs>

export const containerRunSpecKeys = () => ({
  ...containerTestSpecKeys(),
  cacheResult: cacheResultSchema(),
})
export const containerRunActionSchema = () => joi.object().keys(containerRunSpecKeys())

// BUILD //

export interface ContainerBuildOutputs {
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

export const containerBuildOutputSchemaKeys = () => ({
  "localImageName": joi
    .string()
    .required()
    .description("The name of the image (without tag/version) that the module uses for local builds and deployments.")
    .example("my-module"),
  "localImageId": joi
    .string()
    .required()
    .description("The full ID of the image (incl. tag/version) that the module uses for local builds and deployments.")
    .example("my-module:v-abf3f8dca"),
  "deploymentImageName": joi
    .string()
    .required()
    .description("The name of the image (without tag/version) that the module will use during deployment.")
    .example("my-deployment-registry.io/my-org/my-module"),
  "deploymentImageId": joi
    .string()
    .required()
    .description("The full ID of the image (incl. tag/version) that the module will use during deployment.")
    .example("my-deployment-registry.io/my-org/my-module:v-abf3f8dca"),

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
})

export const containerBuildOutputsSchema = () => joi.object().keys(containerBuildOutputSchemaKeys())

export interface ContainerBuildActionSpec {
  buildArgs: PrimitiveMap
  dockerfile: string
  extraFlags: string[]
  localId?: string
  publishId?: string
  targetStage?: string
  timeout: number
}
export type ContainerBuildActionConfig = BuildActionConfig<"container", ContainerBuildActionSpec>
export type ContainerBuildAction = BuildAction<ContainerBuildActionConfig, ContainerBuildOutputs>

export const containerBuildSpecKeys = () => ({
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
})

export const containerCommonBuildSpecKeys = () => ({
  buildArgs: joi
    .object()
    .pattern(/.+/, joiPrimitive())
    .default(() => ({})).description(dedent`
      Specify build arguments to use when building the container image.

      Note: Garden will always set a \`GARDEN_BUILD_VERSION\` (alias \`GARDEN_MODULE_VERSION\`) argument with the module/build version at build time.
    `),
  extraFlags: joi.sparseArray().items(joi.string()).description(deline`
    Specify extra flags to use when building the container image.
    Note that arguments may not be portable across implementations.`),
})

export const containerBuildSpecSchema = () =>
  joi.object().keys({
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
  })

export type ContainerActionConfig =
  | ContainerDeployActionConfig
  | ContainerRunActionConfig
  | ContainerTestActionConfig
  | ContainerBuildActionConfig

export type ContainerRuntimeAction = ContainerDeployAction | ContainerRunAction | ContainerTestAction
export type ContainerAction = ContainerRuntimeAction | ContainerBuildAction
