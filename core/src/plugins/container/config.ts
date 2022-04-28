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
  joiIdentifier,
  joiPrimitive,
  joiSparseArray,
  joiStringMap,
  joiUserIdentifier,
  Primitive,
  PrimitiveMap,
} from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { ingressHostnameSchema, linkUrlSchema } from "../../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../../constants"
import { cacheResultSchema } from "../../config/task"
import { dedent, deline } from "../../util/string"
import { devModeGuideLink } from "../kubernetes/dev-mode"
import { k8sDeploymentTimeoutSchema } from "../kubernetes/config"
import { localModeGuideLink } from "../kubernetes/local-mode"
import { BuildActionConfig } from "../../actions/build"
import { DeployActionConfig } from "../../actions/deploy"
import { TestActionConfig } from "../../actions/test"
import { RunActionConfig } from "../../actions/run"
import { defaultDockerfileName } from "./helpers"

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

export interface ContainerVolumeSpec {
  name: string
  containerPath: string
  hostPath?: string
  module?: string
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
 * DEPRECATED: Use `ContainerResourcesSpec` instead.
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

export type SyncMode = "one-way" | "one-way-replica" | "one-way-reverse" | "one-way-replica-reverse" | "two-way"

export interface DevModeSyncSpec {
  source: string
  target: string
  mode: SyncMode
  exclude?: string[]
  defaultFileMode?: number
  defaultDirectoryMode?: number
  defaultOwner?: number | string
  defaultGroup?: number | string
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
        POSIX-style path of the directory to sync to the target, relative to the module's top-level directory.
        Must be a relative path. Defaults to the module's top-level directory if no value is provided.`
      )
      .example("src"),
    target: joi
      .posixPath()
      .absoluteOnly()
      .required()
      .description(
        deline`
        POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is
        not allowed.`
      )
      .example("/app/src"),
    exclude: syncExcludeSchema(),
    mode: joi
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
      .default("one-way-safe")
      .description(
        "The sync mode to use for the given paths. See the [Dev Mode guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for details."
      ),
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

export const containerCpuSchema = (targetType: "deployment" | "run" | "test") =>
  joi.object().keys({
    min: joi.number().default(defaultContainerResources.cpu.min).description(deline`
          The minimum amount of CPU the ${targetType} needs to be available for it to be deployed, in millicpus
          (i.e. 1000 = 1 CPU)
        `),
    max: joi
      .number()
      .default(defaultContainerResources.cpu.max)
      .min(10)
      .description(`The maximum amount of CPU the ${targetType} can use, in millicpus (i.e. 1000 = 1 CPU)`),
  })

export const containerMemorySchema = (targetType: "deployment" | "run" | "test") =>
  joi.object().keys({
    min: joi.number().default(defaultContainerResources.memory.min).description(deline`
        The minimum amount of RAM the ${targetType} needs to be available for it to be deployed, in megabytes
        (i.e. 1024 = 1 GB)
      `),
    max: joi
      .number()
      .default(defaultContainerResources.memory.min)
      .min(64)
      .description(`The maximum amount of RAM the ${targetType} can use, in megabytes (i.e. 1024 = 1 GB)`),
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

const volumeSchema = () =>
  joi
    .object()
    .keys({
      name: joiUserIdentifier().required().description("The name of the allocated volume."),
      containerPath: joi
        .posixPath()
        .required()
        .description("The path where the volume should be mounted in the container."),
      hostPath: joi
        .posixPath()
        .description(
          dedent`
        _NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
        and providers. Some providers may not support it at all._

        A local path or path on the node that's running the container, to mount in the container, relative to the
        module source path (or absolute).
      `
        )
        .example("/some/dir"),
      module: joiIdentifier().description(
        dedent`
      The name of a _volume module_ that should be mounted at \`containerPath\`. The supported module types will depend on which provider you are using. The \`kubernetes\` provider supports the [persistentvolumeclaim module](./persistentvolumeclaim.md), for example.

      When a \`module\` is specified, the referenced module/volume will be automatically configured as a runtime dependency of this service, as well as a build dependency of this module.

      Note: Make sure to pay attention to the supported \`accessModes\` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.
      `
      ),
    })
    .oxor("hostPath", "module")

export function getContainerVolumesSchema(targetType: "deployment" | "run" | "test") {
  return joiSparseArray(volumeSchema()).unique("name").description(dedent`
    List of volumes that should be mounted when starting the ${targetType}.

    Note: If neither \`hostPath\` nor \`module\` is specified, an empty ephemeral volume is created and mounted when deploying the container.
  `)
}

const containerPrivilegedSchema = (targetType: "deployment" | "run" | "test") =>
  joi
    .boolean()
    .optional()
    .description(
      `If true, run the ${targetType}'s main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.`
    )

const containerAddCapabilitiesSchema = (targetType: "deployment" | "run" | "test") =>
  joi
    .sparseArray()
    .items(joi.string())
    .optional()
    .description(`POSIX capabilities to add to the running ${targetType}'s main container.`)

const containerDropCapabilitiesSchema = (targetType: "deployment" | "run" | "test") =>
  joi
    .sparseArray()
    .items(joi.string())
    .optional()
    .description(`POSIX capabilities to remove from the running ${targetType}'s main container.`)

export const hotReloadCommandSchema = () =>
  joi
    .sparseArray()
    .items(joi.string())
    .description(
      deline`
      **DEPRECATED: Please use devMode instead.**

      If running with hot-reloading enabled, the container will be run with this command/entrypoint instead of the default.
      `
    )
    .example(commandExample)
    .meta({ deprecated: true })

export const hotReloadArgsSchema = () =>
  joi
    .sparseArray()
    .items(joi.string())
    .description(
      deline`
      **DEPRECATED: Please use devMode instead.**

      If specified, overrides the arguments for the main container when running in hot-reload mode.
      `
    )
    .example(["nodemon", "my-server.js"])
    .meta({ deprecated: true })

export interface ContainerDeploySpec {
  annotations: Annotations
  command?: string[]
  args: string[]
  daemon: boolean
  devMode?: ContainerDevModeSpec
  localMode?: ContainerLocalModeSpec
  ingresses: ContainerIngressSpec[]
  env: PrimitiveMap
  healthCheck?: ServiceHealthCheckSpec
  // TODO: remove in 0.13
  hotReload?: {
    command?: string[]
    args?: string[]
  }
  timeout?: number
  limits?: ServiceLimitSpec
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]
  ports: ServicePortSpec[]
  replicas?: number
  volumes: ContainerVolumeSpec[]
  privileged?: boolean
  tty?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}
export type ContainerDeployActionConfig = DeployActionConfig<"container", ContainerDeploySpec>

export const containerDeploySchemaKeys = () => ({
  annotations: annotationsSchema().description(
    dedent`
    Annotations to attach to the service _(note: May not be applicable to all providers)_.

    When using the Kubernetes provider, these annotations are applied to both Service and Pod resources. You can generally specify the annotations intended for both Pods or Services here, and the ones that don't apply on either side will be ignored (i.e. if you put a Service annotation here, it'll also appear on Pod specs but will be safely ignored there, and vice versa).
    `
  ),
  command: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The command/entrypoint to run the container with when starting the service.")
    .example(commandExample),
  args: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The arguments to run the container with when starting the service.")
    .example(["npm", "start"]),
  daemon: joi.boolean().default(false).description(deline`
      Whether to run the service as a daemon (to ensure exactly one instance runs per node).
      May not be supported by all providers.
    `),
  devMode: containerDevModeSchema(),
  localMode: containerLocalModeSchema(),
  ingresses: joiSparseArray(ingressSchema())
    .description("List of ingress endpoints that the service exposes.")
    .example([{ path: "/api", port: "http" }]),
  env: containerEnvVarsSchema(),
  healthCheck: healthCheckSchema().description("Specify how the service's health should be checked after deploying."),
  timeout: k8sDeploymentTimeoutSchema(),
  limits: limitsSchema()
    .description("Specify resource limits for the service.")
    .meta({ deprecated: "Please use the `cpu` and `memory` fields instead." }),
  cpu: containerCpuSchema("deployment").default(defaultContainerResources.cpu),
  memory: containerMemorySchema("deployment").default(defaultContainerResources.memory),
  ports: joiSparseArray(portSchema()).unique("name").description("List of ports that the service container exposes."),
  replicas: joi.number().integer().description(deline`
    The number of instances of the service to deploy.
    Defaults to 3 for environments configured with \`production: true\`, otherwise 1.

    Note: This setting may be overridden or ignored in some cases. For example, when running with \`daemon: true\`,
    with hot-reloading enabled, or if the provider doesn't support multiple replicas.
  `),
  volumes: getContainerVolumesSchema("deployment"),
  privileged: containerPrivilegedSchema("deployment"),
  tty: joi
    .boolean()
    .default(false)
    .description(
      "Specify if containers in this module have TTY support enabled (which implies having stdin support enabled)."
    ),
  addCapabilities: containerAddCapabilitiesSchema("deployment"),
  dropCapabilities: containerDropCapabilitiesSchema("deployment"),
})

export const containerDeploySchema = () => joi.object().keys(containerDeploySchemaKeys())

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

export interface ContainerTestActionSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  command?: string[]
  env: ContainerEnvVars
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]
  volumes: ContainerVolumeSpec[]
  privileged?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}
export type ContainerTestActionConfig = TestActionConfig<"container", ContainerTestActionSpec>

export const containerTestSpecKeys = () => ({
  args: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The arguments used to run the test inside the container.")
    .example(["npm", "test"]),
  artifacts: artifactsSchema(),
  command: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The command/entrypoint used to run the test inside the container.")
    .example(commandExample),
  env: containerEnvVarsSchema(),
  cpu: containerCpuSchema("test").default(defaultContainerResources.cpu),
  memory: containerMemorySchema("test").default(defaultContainerResources.memory),
  volumes: getContainerVolumesSchema("test"),
  privileged: containerPrivilegedSchema("test"),
  addCapabilities: containerAddCapabilitiesSchema("test"),
  dropCapabilities: containerDropCapabilitiesSchema("test"),
})

export const containerTestActionSchema = () => joi.object().keys(containerTestSpecKeys())

export interface ContainerRunActionSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  cacheResult: boolean
  command?: string[]
  env: ContainerEnvVars
  image?: string
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]
  volumes: ContainerVolumeSpec[]
  privileged?: boolean
  addCapabilities?: string[]
  dropCapabilities?: string[]
}
export type ContainerRunActionConfig = RunActionConfig<"container", ContainerRunActionSpec>

export const containerRunSpecKeys = () => ({
  args: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The arguments used to run the container (applied on top of the command/entrypoint).")
    .example(["rake", "db:migrate"]),
  artifacts: artifactsSchema(),
  cacheResult: cacheResultSchema(),
  command: joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description("The command/entrypoint used when running the container.")
    .example(commandExample),
  env: containerEnvVarsSchema(),
  cpu: containerCpuSchema("run").default(defaultContainerResources.cpu),
  memory: containerMemorySchema("run").default(defaultContainerResources.memory),
  volumes: getContainerVolumesSchema("run"),
  privileged: containerPrivilegedSchema("run"),
  addCapabilities: containerAddCapabilitiesSchema("run"),
  dropCapabilities: containerDropCapabilitiesSchema("run"),
})

export const containerRunActionSchema = () => joi.object().keys(containerRunSpecKeys())

export interface ContainerBuildActionSpec {
  buildArgs: PrimitiveMap
  dockerfile: string
  extraFlags: string[]
  publishId?: string
  targetStage?: string
  timeout: number
}
export type ContainerBuildActionConfig = BuildActionConfig<"container", ContainerBuildActionSpec>

export const containerBuildSpecKeys = () => ({
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

export const dockerImageBuildSpecSchema = () =>
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
  })

export type ContainerActionConfig =
  | ContainerDeployActionConfig
  | ContainerRunActionConfig
  | ContainerTestActionConfig
  | ContainerBuildActionConfig
