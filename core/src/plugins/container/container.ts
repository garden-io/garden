/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { keyBy, omit } from "lodash-es"

import { ConfigurationError } from "../../exceptions.js"
import { createGardenPlugin } from "../../plugin/plugin.js"
import { containerHelpers } from "./helpers.js"
import type {
  ContainerActionConfig,
  ContainerBuildActionConfig,
  ContainerModule,
  ContainerModuleVolumeSpec,
  ContainerRuntimeActionConfig,
} from "./moduleConfig.js"
import { containerModuleOutputsSchema, containerModuleSpecSchema, defaultDockerfileName } from "./moduleConfig.js"
import {
  buildContainer,
  getContainerBuildActionOutputs,
  getContainerBuildStatus,
  validateContainerBuild,
} from "./build.js"
import type { ConfigureModuleParams } from "../../plugin/handlers/Module/configure.js"
import { dedent, naturalList } from "../../util/string.js"
import type { Provider, BaseProviderConfig } from "../../config/provider.js"
import { providerConfigBaseSchema } from "../../config/provider.js"
import type { GetModuleOutputsParams } from "../../plugin/handlers/Module/get-outputs.js"
import type { ConvertModuleParams } from "../../plugin/handlers/Module/convert.js"
import type { ExecActionConfig } from "../exec/config.js"
import type { ContainerRuntimeAction } from "./config.js"
import {
  containerBuildOutputsSchema,
  containerDeploySchema,
  containerRunActionSchema,
  containerTestActionSchema,
  containerBuildSpecSchema,
  containerDeployOutputsSchema,
  containerTestOutputSchema,
  containerRunOutputSchema,
} from "./config.js"
import { publishContainerBuild } from "./publish.js"
import type { Resolved } from "../../actions/types.js"
import { getDeployedImageId } from "../kubernetes/container/util.js"
import type { DeepPrimitiveMap } from "../../config/common.js"
import { joi } from "../../config/common.js"
import { DEFAULT_DEPLOY_TIMEOUT_SEC, gardenEnv } from "../../constants.js"
import type { ExecBuildConfig } from "../exec/build.js"
import type { PluginToolSpec } from "../../plugin/tools.js"

export const CONTAINER_STATUS_CONCURRENCY_LIMIT = gardenEnv.GARDEN_HARD_CONCURRENCY_LIMIT
export const CONTAINER_BUILD_CONCURRENCY_LIMIT_LOCAL = 5
export const CONTAINER_BUILD_CONCURRENCY_LIMIT_CLOUD_BUILDER = 20

export interface ContainerProviderConfig extends BaseProviderConfig {
  dockerBuildExtraFlags?: string[]
  gardenCloudBuilder?: {
    enabled: boolean
  }
}

export const configSchema = () =>
  providerConfigBaseSchema()
    .keys({
      dockerBuildExtraFlags: joi.array().items(joi.string()).description(dedent`
          **Stability: Experimental**. Subject to breaking changes within minor releases.

          Extra flags to pass to the \`docker build\` command. Will extend the \`spec.extraFlags\` specified in each container Build action.
          `),
      // Cloud builder
      gardenCloudBuilder: joi
        .object()
        .optional()
        .keys({
          enabled: joi.boolean().default(false).description(dedent`
            **Stability: Experimental**. Subject to breaking changes within minor releases.

            Enable Garden Cloud Builder, which can speed up builds significantly using fast machines and extremely fast caching.

            by running \`GARDEN_CLOUD_BUILDER=1 garden build\` you can try Garden Cloud Builder temporarily without any changes to your Garden configuration.
            The environment variable \`GARDEN_CLOUD_BUILDER\` can also be used to override this setting, if enabled in the configuration. Set it to \`false\` or \`0\` to temporarily disable Garden Cloud Builder.

            Under the hood, enabling this option means that Garden will install a remote buildx driver on your local Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/

            If service limits are reached, or Garden Cloud Builder is not available, Garden will fall back to building images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is configured in the Kubernetes provider configuration.

            Please note that when enabling Cloud Builder together with in-cluster building, you need to authenticate to your \`deploymentRegistry\` from the local machine (e.g. by running \`docker login\`).
            `),
        }).description(dedent`
        **Stability: Experimental**. Subject to breaking changes within minor releases.
        `),
    })
    .unknown(false)

export type ContainerProvider = Provider<ContainerProviderConfig>

export const dockerVersion = "25.0.2"
export const dockerSpec: PluginToolSpec = {
  name: "docker",
  version: dockerVersion,
  description: `The official Docker CLI, v${dockerVersion}`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://download.docker.com/mac/static/stable/x86_64/docker-${dockerVersion}.tgz`,
      sha256: "3c7e0d69bd7bc78d39a48d6e2102979efdc128e1ee7e730be93e69ff7e389655",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://download.docker.com/mac/static/stable/aarch64/docker-${dockerVersion}.tgz`,
      sha256: "6b95f574215fc92608cdef7d83d4ab8ab17107b4eade95b2b915705bfc3260c7",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://download.docker.com/linux/static/stable/x86_64/docker-${dockerVersion}.tgz`,
      sha256: "a83b394570052c12ac5255801b322676092b4985d82f4c1a92253f45de45dc99",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://download.docker.com/linux/static/stable/aarch64/docker-${dockerVersion}.tgz`,
      sha256: "6a2cb41789469bc6ecddff22be014540f8a92fa0bee9fcf0771e3179ef3fc673",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/rgl/docker-ce-windows-binaries-vagrant/releases/download/v${dockerVersion}/docker-${dockerVersion}.zip`,
      sha256: "25ff5d9dd8ae176dd30fd97b0b99a896d598fa62fca0b7171b45887ad4d3661b",
      extract: {
        format: "zip",
        targetPath: "docker/docker.exe",
      },
    },
  ],
}

export const namespaceCliVersion = "0.0.354"
export const namespaceCliSpec: PluginToolSpec = {
  name: "namespace-cli",
  version: dockerVersion,
  description: `Namespace.so CLI v${dockerVersion}`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://get.namespace.so/packages/nsc/v${namespaceCliVersion}/nsc_${namespaceCliVersion}_darwin_amd64.tar.gz`,
      sha256: "a091e5f4afeccfffe30231b3528c318bc3201696e09ac3c07adaf283cea42f91",
      extract: {
        format: "tar",
        targetPath: "nsc",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://get.namespace.so/packages/nsc/v${namespaceCliVersion}/nsc_${namespaceCliVersion}_darwin_arm64.tar.gz`,
      sha256: "7641623358ec141c6ab8d243f5f97eab0417338bb1fd490daaf814947c4ed682",
      extract: {
        format: "tar",
        targetPath: "nsc",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://get.namespace.so/packages/nsc/v${namespaceCliVersion}/nsc_${namespaceCliVersion}_linux_amd64.tar.gz`,
      sha256: "8d180cf1c3e2f2861c34e89b722d9a5612888e3889d2d7767b02be955e6fc7ef",
      extract: {
        format: "tar",
        targetPath: "nsc",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://get.namespace.so/packages/nsc/v${namespaceCliVersion}/nsc_${namespaceCliVersion}_linux_arm64.tar.gz`,
      sha256: "0646fae1d6ca41888cbcac749b04ad303adcb5b2a7eb5260cddad1d7566ba0d6",
      extract: {
        format: "tar",
        targetPath: "nsc",
      },
    },
    // No windows support at the moment, only WSL
    // {
    //   platform: "windows",
    //   architecture: "amd64",
    //   url: `https://get.namespace.so/packages/nsc/v${namespaceCliVersion}/nsc_${namespaceCliVersion}_${os}_${architecture}.tar.gz`,
    //   sha256: "25ff5d9dd8ae176dd30fd97b0b99a896d598fa62fca0b7171b45887ad4d3661b",
    //   extract: {
    //     format: "zip",
    //     targetPath: "docker/docker.exe",
    //   },
    // },
  ],
}

// TODO: remove in 0.14. validation should be in the action validation handler.
export async function configureContainerModule({ log, moduleConfig }: ConfigureModuleParams<ContainerModule>) {
  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((spec) => {
    // make sure ports are correctly configured
    const name = spec.name
    const definedPorts = spec.ports
    const portsByName = keyBy(spec.ports, "name")

    const definedPortsDescription =
      definedPorts.length > 0 ? ` Ports declared in service spec: ${naturalList(definedPorts.map((p) => p.name))}` : ""

    for (const ingress of spec.ingresses) {
      const ingressPort = ingress.port

      if (!portsByName[ingressPort]) {
        throw new ConfigurationError({
          message: `Service ${name} does not define port ${ingressPort} defined in ingress.${definedPortsDescription}`,
        })
      }
    }

    if (spec.healthCheck && spec.healthCheck.httpGet) {
      const healthCheckHttpPort = spec.healthCheck.httpGet.port

      if (!portsByName[healthCheckHttpPort]) {
        throw new ConfigurationError({
          message: `Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check.${definedPortsDescription}`,
        })
      }
    }

    if (spec.healthCheck && spec.healthCheck.tcpPort) {
      const healthCheckTcpPort = spec.healthCheck.tcpPort

      if (!portsByName[healthCheckTcpPort]) {
        throw new ConfigurationError({
          message: `Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check.${definedPortsDescription}`,
        })
      }
    }

    for (const volume of spec.volumes) {
      if (volume.module) {
        spec.dependencies.push(volume.module)
      }
    }

    return {
      name,
      dependencies: spec.dependencies,
      disabled: spec.disabled,
      spec,
    }
  })

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => {
    for (const volume of t.volumes) {
      if (volume.module) {
        t.dependencies.push(volume.module)
      }
    }

    return {
      name: t.name,
      dependencies: t.dependencies,
      disabled: t.disabled,
      spec: t,
      timeout: t.timeout,
    }
  })

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => {
    for (const volume of t.volumes) {
      if (volume.module) {
        t.dependencies.push(volume.module)
      }
    }

    return {
      name: t.name,
      cacheResult: t.cacheResult,
      dependencies: t.dependencies,
      disabled: t.disabled,
      spec: t,
      timeout: t.timeout,
    }
  })

  // All the config keys that affect the build version
  moduleConfig.buildConfig = {
    buildArgs: moduleConfig.spec.buildArgs,
    targetImage: moduleConfig.spec.build?.targetImage,
    extraFlags: moduleConfig.spec.extraFlags,
    dockerfile: moduleConfig.spec.dockerfile,
  }

  // Automatically set the include field based on the Dockerfile and config, if not explicitly set
  if (!(moduleConfig.include || moduleConfig.exclude)) {
    moduleConfig.include = await containerHelpers.autoResolveIncludes(moduleConfig, log)
  }

  return { moduleConfig }
}

export async function getContainerModuleOutputs({ moduleConfig, version }: GetModuleOutputsParams) {
  const deploymentImageName = containerHelpers.getDeploymentImageName(
    moduleConfig.name,
    moduleConfig.spec.image,
    undefined
  )
  const deploymentImageId = containerHelpers.getModuleDeploymentImageId(moduleConfig, version, undefined)

  // If there is no Dockerfile (i.e. we don't need to build anything) we use the image field directly.
  // Otherwise we set the tag to the module version.
  const hasDockerfile = containerHelpers.moduleHasDockerfile(moduleConfig, version)
  const localImageId =
    moduleConfig.spec.image && !hasDockerfile
      ? moduleConfig.spec.image
      : containerHelpers.getLocalImageId(moduleConfig.name, moduleConfig.spec.image, version)

  return {
    outputs: {
      "local-image-name": containerHelpers.getLocalImageName(moduleConfig.name, moduleConfig.spec.image),
      "local-image-id": localImageId,
      "deployment-image-name": deploymentImageName,
      "deployment-image-id": deploymentImageId,
    },
  }
}

function convertContainerModuleRuntimeActions(
  convertParams: ConvertModuleParams<ContainerModule>,
  buildAction: ContainerBuildActionConfig | ExecBuildConfig | undefined,
  needsContainerBuild: boolean
) {
  const { module, services, tasks, tests, prepareRuntimeDependencies } = convertParams
  const actions: ContainerActionConfig[] = []

  let deploymentImageId = module.spec.image
  if (deploymentImageId) {
    // If `module.spec.image` is set, but the image id is missing a tag, we need to add the module version as the tag.
    deploymentImageId = containerHelpers.getModuleDeploymentImageId(module, module.version, undefined)
  }

  const volumeModulesReferenced: string[] = []

  function configureActionVolumes(action: ContainerRuntimeActionConfig, volumeSpec: ContainerModuleVolumeSpec[]) {
    volumeSpec.forEach((v) => {
      const referencedPvcAction = v.module ? { kind: <const>"Deploy", name: v.module } : undefined
      action.spec.volumes.push({
        ...omit(v, "module"),
        action: referencedPvcAction,
      })
      if (referencedPvcAction) {
        action.dependencies?.push(referencedPvcAction)
      }
      if (v.module) {
        volumeModulesReferenced.push(v.module)
      }
    })
    return action
  }

  for (const service of services) {
    const action: ContainerActionConfig = {
      kind: "Deploy",
      type: "container",
      name: service.name,
      ...convertParams.baseFields,

      disabled: service.disabled,
      build: buildAction?.name,
      dependencies: prepareRuntimeDependencies(service.spec.dependencies, buildAction),

      timeout: service.spec.timeout || DEFAULT_DEPLOY_TIMEOUT_SEC,
      spec: {
        ...omit(service.spec, ["name", "dependencies", "disabled"]),
        image: deploymentImageId,
        volumes: [],
      },
    }
    actions.push(configureActionVolumes(action, service.config.spec.volumes))
  }

  for (const task of tasks) {
    const action: ContainerActionConfig = {
      kind: "Run",
      type: "container",
      name: task.name,
      description: task.spec.description,
      ...convertParams.baseFields,

      disabled: task.disabled,
      build: buildAction?.name,
      dependencies: prepareRuntimeDependencies(task.spec.dependencies, buildAction),
      timeout: task.spec.timeout,

      spec: {
        ...omit(task.spec, ["name", "description", "dependencies", "disabled", "timeout"]),
        image: needsContainerBuild ? undefined : module.spec.image,
        volumes: [],
      },
    }
    actions.push(configureActionVolumes(action, task.config.spec.volumes))
  }

  for (const test of tests) {
    const action: ContainerActionConfig = {
      kind: "Test",
      type: "container",
      name: module.name + "-" + test.name,
      ...convertParams.baseFields,

      disabled: test.disabled,
      build: buildAction?.name,
      dependencies: prepareRuntimeDependencies(test.spec.dependencies, buildAction),
      timeout: test.spec.timeout,

      spec: {
        ...omit(test.spec, ["name", "dependencies", "disabled", "timeout"]),
        image: needsContainerBuild ? undefined : module.spec.image,
        volumes: [],
      },
    }
    actions.push(configureActionVolumes(action, test.config.spec.volumes))
  }

  return { actions, volumeModulesReferenced }
}

export async function convertContainerModule(params: ConvertModuleParams<ContainerModule>) {
  const { module, convertBuildDependency, dummyBuild } = params
  const actions: (ContainerActionConfig | ExecActionConfig)[] = []

  let needsContainerBuild = false

  if (containerHelpers.moduleHasDockerfile(module, module.version)) {
    needsContainerBuild = true
  }

  let buildAction: ContainerBuildActionConfig | ExecBuildConfig | undefined = undefined

  if (needsContainerBuild) {
    buildAction = {
      kind: "Build",
      type: "container",
      name: module.name,
      ...params.baseFields,

      copyFrom: dummyBuild?.copyFrom,
      allowPublish: module.allowPublish,
      dependencies: module.build.dependencies.map(convertBuildDependency),
      timeout: module.build.timeout,

      spec: {
        buildArgs: module.spec.buildArgs,
        dockerfile: module.spec.dockerfile || defaultDockerfileName,
        extraFlags: module.spec.extraFlags,
        localId: module.spec.image,
        publishId: module.spec.image,
        targetStage: module.spec.build.targetImage,
      },
    }
    actions.push(buildAction)
  } else if (dummyBuild) {
    buildAction = dummyBuild
    actions.push(buildAction!)
  }

  const { actions: runtimeActions, volumeModulesReferenced } = convertContainerModuleRuntimeActions(
    params,
    buildAction,
    needsContainerBuild
  )
  actions.push(...runtimeActions)
  if (buildAction) {
    buildAction.dependencies = buildAction.dependencies?.filter((d) => !volumeModulesReferenced.includes(d.name))
  }

  return {
    group: {
      // This is an annoying TypeScript limitation :P
      kind: <const>"Group",
      name: module.name,
      path: module.path,
      actions,
    },
  }
}

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "container",
    docs: dedent`
      Provides the \`container\` actions and module type.
      _Note that this provider is currently automatically included, and you do not need to configure it in your project configuration._
    `,
    configSchema: configSchema(),

    createActionTypes: {
      Build: [
        {
          name: "container",
          docs: dedent`
            Build a Docker container image, and (if applicable) push to a remote registry.
          `,
          staticOutputsSchema: containerBuildOutputsSchema(),
          schema: containerBuildSpecSchema(),
          handlers: {
            async getOutputs({ action }) {
              // TODO: figure out why this cast is needed here
              return {
                outputs: getContainerBuildActionOutputs(action) as unknown as DeepPrimitiveMap,
              }
            },

            build: buildContainer,
            getStatus: getContainerBuildStatus,
            publish: publishContainerBuild,
            validate: validateContainerBuild,
          },
        },
      ],
      Deploy: [
        {
          name: "container",
          docs: dedent`
            Deploy a container image, e.g. in a Kubernetes namespace (when used with the \`kubernetes\` provider).

            This is a simplified abstraction, which can be convenient for simple deployments, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Deploy types like [helm](./helm.md) or [kubernetes](./kubernetes.md).
          `,
          schema: containerDeploySchema(),
          staticOutputsSchema: containerDeployOutputsSchema(),
          handlers: {
            // Other handlers are implemented by other providers (e.g. kubernetes)
            async configure({ config }) {
              return { config, supportedModes: { sync: !!config.spec.sync, local: !!config.spec.localMode } }
            },

            async validate({ action }) {
              // make sure ports are correctly configured
              validateRuntimeCommon(action)
              const spec = action.getSpec()
              const definedPorts = spec.ports
              const portsByName = keyBy(spec.ports, "name")

              const definedPortsDescription =
                definedPorts.length > 0
                  ? ` Ports declared in Deploy spec: ${naturalList(definedPorts.map((p) => p.name))}`
                  : ""

              for (const ingress of spec.ingresses) {
                const ingressPort = ingress.port

                if (!portsByName[ingressPort]) {
                  throw new ConfigurationError({
                    message: `${action.longDescription()} does not define port ${ingressPort} defined in ingress.${definedPortsDescription}`,
                  })
                }
              }

              if (spec.healthCheck && spec.healthCheck.httpGet) {
                const healthCheckHttpPort = spec.healthCheck.httpGet.port

                if (!portsByName[healthCheckHttpPort]) {
                  throw new ConfigurationError({
                    message: `${action.longDescription()} does not define port ${healthCheckHttpPort} defined in httpGet health check.${definedPortsDescription}`,
                  })
                }
              }

              if (spec.healthCheck && spec.healthCheck.tcpPort) {
                const healthCheckTcpPort = spec.healthCheck.tcpPort

                if (!portsByName[healthCheckTcpPort]) {
                  throw new ConfigurationError({
                    message: `${action.longDescription()} does not define port ${healthCheckTcpPort} defined in tcpPort health check.${definedPortsDescription}`,
                  })
                }
              }

              return {}
            },

            async getOutputs({ action }) {
              return {
                outputs: {
                  deployedImageId: getDeployedImageId(action),
                },
              }
            },
          },
        },
      ],
      Run: [
        {
          name: "container",
          docs: dedent`
            Run a command in a container image, e.g. in a Kubernetes namespace (when used with the \`kubernetes\` provider).

            This is a simplified abstraction, which can be convenient for simple tasks, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Run types like [kubernetes-pod](./kubernetes-pod.md).
          `,
          schema: containerRunActionSchema(),
          runtimeOutputsSchema: containerRunOutputSchema(),
          handlers: {
            // Implemented by other providers (e.g. kubernetes)
            async validate({ action }) {
              validateRuntimeCommon(action)
              return {}
            },
          },
        },
      ],
      Test: [
        {
          name: "container",
          docs: dedent`
            Define a Test which runs a command in a container image, e.g. in a Kubernetes namespace (when used with the \`kubernetes\` provider).

            This is a simplified abstraction, which can be convenient for simple scenarios, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Test types like [kubernetes-pod](./kubernetes-pod.md).
          `,
          schema: containerTestActionSchema(),
          runtimeOutputsSchema: containerTestOutputSchema(),
          handlers: {
            // Implemented by other providers (e.g. kubernetes)
            async validate({ action }) {
              validateRuntimeCommon(action)
              return {}
            },
          },
        },
      ],
    },

    createModuleTypes: [
      {
        name: "container",
        docs: dedent`
          Specify a container image to build or pull from a remote registry.
          You may also optionally specify services to deploy, tasks or tests to run inside the container.

          Note that the runtime services have somewhat limited features in this module type. For example, you cannot
          specify replicas for redundancy, and various platform-specific options are not included. For those, look at
          other module types like [helm](./helm.md) or
          [kubernetes](./kubernetes.md).
        `,
        moduleOutputsSchema: containerModuleOutputsSchema(),
        schema: containerModuleSpecSchema(),
        needsBuild: true,
        handlers: {
          configure: configureContainerModule,
          getModuleOutputs: getContainerModuleOutputs,
          convert: convertContainerModule,
        },
      },
    ],

    tools: [dockerSpec, namespaceCliSpec],
  })

function validateRuntimeCommon(action: Resolved<ContainerRuntimeAction>) {
  const { build } = action.getConfig()
  const { image, volumes } = action.getSpec()

  if (!build && !image) {
    throw new ConfigurationError({
      message: `${action.longDescription()} must specify one of \`build\` or \`spec.image\``,
    })
  } else if (build && image) {
    throw new ConfigurationError({
      message: `${action.longDescription()} specifies both \`build\` and \`spec.image\`. Only one may be specified.`,
    })
  } else if (build) {
    const buildAction = action.getDependency({ kind: "Build", name: build }, { includeDisabled: true })
    if (buildAction && !buildAction?.isCompatible("container")) {
      throw new ConfigurationError({
        message: `${action.longDescription()} build field must specify a container Build, or a compatible type. Got Build action type: ${
          buildAction.getConfig().type
        }`,
      })
    }
  }

  for (const volume of volumes) {
    if (volume.action && !action.hasDependency(volume.action)) {
      throw new ConfigurationError({
        message: `${action.longDescription()} references action ${
          volume.action
        } under \`spec.volumes\` but does not declare a dependency on it. Please add an explicit dependency on the volume action.`,
      })
    }
  }
}
