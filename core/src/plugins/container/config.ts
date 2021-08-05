/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenModule, FileCopySpec } from "../../types/module"
import {
  joiUserIdentifier,
  PrimitiveMap,
  joiPrimitive,
  joi,
  envVarRegex,
  Primitive,
  joiModuleIncludeDirective,
  joiIdentifier,
  joiSparseArray,
} from "../../config/common"
import { ArtifactSpec } from "./../../config/validation"
import { GardenService, ingressHostnameSchema, linkUrlSchema } from "../../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../../constants"
import { ModuleSpec, ModuleConfig, baseBuildSpecSchema, BaseBuildSpec } from "../../config/module"
import { CommonServiceSpec, ServiceConfig, baseServiceSpecSchema } from "../../config/service"
import { baseTaskSpecSchema, BaseTaskSpec, cacheResultSchema } from "../../config/task"
import { baseTestSpecSchema, BaseTestSpec } from "../../config/test"
import { joiStringMap } from "../../config/common"
import { dedent, deline } from "../../util/string"
import { getModuleTypeUrl } from "../../docs/common"

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

export interface ContainerServiceSpec extends CommonServiceSpec {
  annotations: Annotations
  command?: string[]
  args: string[]
  daemon: boolean
  devMode?: ContainerDevModeSpec
  ingresses: ContainerIngressSpec[]
  env: PrimitiveMap
  healthCheck?: ServiceHealthCheckSpec
  hotReloadCommand?: string[]
  hotReloadArgs?: string[]
  limits?: ServiceLimitSpec
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]
  ports: ServicePortSpec[]
  replicas?: number
  volumes: ContainerVolumeSpec[]
}

export const commandExample = ["/bin/sh", "-c"]

const hotReloadSyncSchema = () =>
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
  })

export interface ContainerHotReloadSpec {
  sync: FileCopySpec[]
  postSyncCommand?: string[]
}

const hotReloadConfigSchema = () =>
  joi.object().keys({
    sync: joi
      .array()
      .items(hotReloadSyncSchema())
      .required()
      .description("Specify one or more source files or directories to automatically sync into the running container."),
    postSyncCommand: joi
      .array()
      .items(joi.string())
      .optional()
      .description(`An optional command to run inside the container after syncing.`)
      .example(["rebuild-static-assets.sh"]),
  }).description(deline`
    Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled
    services when those files or directories are modified. Applies to this module's services, and to services
    with this module as their \`sourceModule\`.
  `)

export type SyncMode = "one-way" | "one-way-replica" | "two-way"

export interface DevModeSyncSpec {
  source: string
  target: string
  mode: SyncMode
  exclude?: string[]
}

const devModeSyncSchema = () =>
  hotReloadSyncSchema().keys({
    exclude: joi
      .array()
      .items(joi.posixPath().allowGlobs().subPathOnly())
      .description(`Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.`)
      .example(["dist/**/*", "*.log"]),
    mode: joi
      .string()
      .allow("one-way", "one-way-replica", "two-way")
      .default("one-way")
      .description(
        "The sync mode to use for the given paths. Allowed options: `one-way`, `one-way-replica`, `two-way`."
      ),
  })

export interface ContainerDevModeSpec {
  args?: string[]
  command?: string[]
  sync: DevModeSyncSpec[]
}

export const containerDevModeSchema = () =>
  joi.object().keys({
    args: joi.array().items(joi.string()).description("Override the default container arguments when in dev mode."),
    command: joi
      .array()
      .items(joi.string())
      .description("Override the default container command (i.e. entrypoint) when in dev mode."),
    sync: joi
      .array()
      .items(devModeSyncSchema())
      .description("Specify one or more source files or directories to automatically sync with the running container."),
  }).description(dedent`
    **EXPERIMENTAL**

    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.
  `)

export type ContainerServiceConfig = ServiceConfig<ContainerServiceSpec>

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
        .array()
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

export const containerCpuSchema = (targetType: string) =>
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

export const containerMemorySchema = (targetType: string) =>
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

const moduleTypeUrl = getModuleTypeUrl("persistentvolumeclaim")

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
      The name of a _volume module_ that should be mounted at \`containerPath\`. The supported module types will depend on which provider you are using. The \`kubernetes\` provider supports the [persistentvolumeclaim module](${moduleTypeUrl}), for example.

      When a \`module\` is specified, the referenced module/volume will be automatically configured as a runtime dependency of this service, as well as a build dependency of this module.

      Note: Make sure to pay attention to the supported \`accessModes\` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.
      `
      ),
    })
    .oxor("hostPath", "module")

export function getContainerVolumesSchema(targetType: string) {
  return joiSparseArray(volumeSchema()).unique("name").description(dedent`
    List of volumes that should be mounted when deploying the ${targetType}.

    Note: If neither \`hostPath\` nor \`module\` is specified, an empty ephemeral volume is created and mounted when deploying the container.
  `)
}

const containerServiceSchema = () =>
  baseServiceSpecSchema().keys({
    annotations: annotationsSchema().description(
      dedent`
      Annotations to attach to the service _(note: May not be applicable to all providers)_.

      When using the Kubernetes provider, these annotations are applied to both Service and Pod resources. You can generally specify the annotations intended for both Pods or Services here, and the ones that don't apply on either side will be ignored (i.e. if you put a Service annotation here, it'll also appear on Pod specs but will be safely ignored there, and vice versa).
      `
    ),
    command: joi
      .array()
      .items(joi.string().allow(""))
      .description("The command/entrypoint to run the container with when starting the service.")
      .example(commandExample),
    args: joi
      .array()
      .items(joi.string().allow(""))
      .description("The arguments to run the container with when starting the service.")
      .example(["npm", "start"]),
    daemon: joi.boolean().default(false).description(deline`
        Whether to run the service as a daemon (to ensure exactly one instance runs per node).
        May not be supported by all providers.
      `),
    devMode: containerDevModeSchema(),
    ingresses: joiSparseArray(ingressSchema())
      .description("List of ingress endpoints that the service exposes.")
      .example([{ path: "/api", port: "http" }]),
    env: containerEnvVarsSchema(),
    healthCheck: healthCheckSchema().description("Specify how the service's health should be checked after deploying."),
    hotReloadCommand: joi
      .array()
      .items(joi.string())
      .description(
        deline`
        If this module uses the \`hotReload\` field, the container will be run with
        this command/entrypoint when the service is deployed with hot reloading enabled.`
      )
      .example(commandExample),
    hotReloadArgs: joi
      .array()
      .items(joi.string())
      .description(
        deline`
        If this module uses the \`hotReload\` field, the container will be run with
        these arguments when the service is deployed with hot reloading enabled.`
      )
      .example(["npm", "run", "dev"]),
    limits: limitsSchema()
      .description("Specify resource limits for the service.")
      .meta({ deprecated: "Please use the `cpu` and `memory` fields instead." }),
    cpu: containerCpuSchema("service").default(defaultContainerResources.cpu),
    memory: containerMemorySchema("service").default(defaultContainerResources.memory),
    ports: joiSparseArray(portSchema()).unique("name").description("List of ports that the service container exposes."),
    replicas: joi.number().integer().description(deline`
      The number of instances of the service to deploy.
      Defaults to 3 for environments configured with \`production: true\`, otherwise 1.

      Note: This setting may be overridden or ignored in some cases. For example, when running with \`daemon: true\`,
      with hot-reloading enabled, or if the provider doesn't support multiple replicas.
    `),
    volumes: getContainerVolumesSchema("service"),
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

export interface ContainerService extends GardenService<ContainerModule> {}

export const artifactsDescription = dedent`
  Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
  the \`.garden/artifacts\` directory.
`

export const artifactsTargetDescription = dedent`
  A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at \`.garden/artifacts\`.
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

export interface ContainerTestSpec extends BaseTestSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  command?: string[]
  env: ContainerEnvVars
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]
  volumes: ContainerVolumeSpec[]
}

export const containerTestSchema = () =>
  baseTestSpecSchema().keys({
    args: joi
      .array()
      .items(joi.string().allow(""))
      .description("The arguments used to run the test inside the container.")
      .example(["npm", "test"]),
    artifacts: artifactsSchema(),
    command: joi
      .array()
      .items(joi.string().allow(""))
      .description("The command/entrypoint used to run the test inside the container.")
      .example(commandExample),
    env: containerEnvVarsSchema(),
    cpu: containerCpuSchema("test").default(defaultContainerResources.cpu),
    memory: containerMemorySchema("test").default(defaultContainerResources.memory),
    volumes: getContainerVolumesSchema("test"),
  })

export interface ContainerTaskSpec extends BaseTaskSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  cacheResult: boolean
  command?: string[]
  env: ContainerEnvVars
  cpu: ContainerResourcesSpec["cpu"]
  memory: ContainerResourcesSpec["memory"]
  volumes: ContainerVolumeSpec[]
}

export const containerTaskSchema = () =>
  baseTaskSpecSchema()
    .keys({
      args: joi
        .array()
        .items(joi.string().allow(""))
        .description("The arguments used to run the task inside the container.")
        .example(["rake", "db:migrate"]),
      artifacts: artifactsSchema(),
      cacheResult: cacheResultSchema(),
      command: joi
        .array()
        .items(joi.string().allow(""))
        .description("The command/entrypoint used to run the task inside the container.")
        .example(commandExample),
      env: containerEnvVarsSchema(),
      cpu: containerCpuSchema("task").default(defaultContainerResources.cpu),
      memory: containerMemorySchema("task").default(defaultContainerResources.memory),
      volumes: getContainerVolumesSchema("task"),
    })
    .description("A task that can be run in the container.")

export interface ContainerBuildSpec extends BaseBuildSpec {
  targetImage?: string
  timeout: number
}

export interface ContainerModuleSpec extends ModuleSpec {
  build: ContainerBuildSpec
  buildArgs: PrimitiveMap
  extraFlags: string[]
  image?: string
  dockerfile?: string
  hotReload?: ContainerHotReloadSpec
  services: ContainerServiceSpec[]
  tests: ContainerTestSpec[]
  tasks: ContainerTaskSpec[]
}

export interface ContainerModuleConfig extends ModuleConfig<ContainerModuleSpec> {}

export const defaultImageNamespace = "_"
export const defaultTag = "latest"

export const containerModuleSpecSchema = () =>
  joi
    .object()
    .keys({
      build: baseBuildSpecSchema().keys({
        targetImage: joi.string().description(deline`
            For multi-stage Dockerfiles, specify which image to build (see
            https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for
            details).
          `),
        timeout: joi
          .number()
          .integer()
          .default(1200)
          .description("Maximum time in seconds to wait for build to finish."),
      }),
      buildArgs: joi
        .object()
        .pattern(/.+/, joiPrimitive())
        .default(() => ({})).description(dedent`
          Specify build arguments to use when building the container image.

          Note: Garden will always set a \`GARDEN_MODULE_VERSION\` argument with the module version at build time.
        `),
      extraFlags: joi.array().items(joi.string()).description(deline`
        Specify extra flags to use when building the container image.
        Note that arguments may not be portable across implementations.`),
      // TODO: validate the image name format
      image: joi.string().description(deline`
        Specify the image name for the container. Should be a valid Docker image identifier. If specified and
        the module does not contain a Dockerfile, this image will be used to deploy services for this module.
        If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.`),
      include: joiModuleIncludeDirective(dedent`
      If neither \`include\` nor \`exclude\` is set, and the module has a Dockerfile, Garden
      will parse the Dockerfile and automatically set \`include\` to match the files and
      folders added to the Docker image (via the \`COPY\` and \`ADD\` directives in the Dockerfile).

      If neither \`include\` nor \`exclude\` is set, and the module
      specifies a remote image, Garden automatically sets \`include\` to \`[]\`.
    `),
      hotReload: hotReloadConfigSchema(),
      dockerfile: joi.posixPath().subPathOnly().description("POSIX-style name of Dockerfile, relative to module root."),
      services: joiSparseArray(containerServiceSchema())
        .unique("name")
        .description("A list of services to deploy from this container module."),
      tests: joiSparseArray(containerTestSchema()).description("A list of tests to run in the module."),
      // We use the user-facing term "tasks" as the key here, instead of "tasks".
      tasks: joiSparseArray(containerTaskSchema()).description(deline`
        A list of tasks that can be run from this container module. These can be used as dependencies for services
        (executed before the service is deployed) or for other tasks.
      `),
    })
    .description("Configuration for a container module.")

export interface ContainerModule<
  M extends ContainerModuleSpec = ContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec,
  W extends ContainerTaskSpec = ContainerTaskSpec
> extends GardenModule<M, S, T, W> {}
