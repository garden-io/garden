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
import type { ActionModes, Resolved } from "../../actions/types.js"
import { getDeployedImageId } from "../kubernetes/container/util.js"
import type { DeepPrimitiveMap } from "../../config/common.js"
import { joi } from "../../config/common.js"
import { DEFAULT_DEPLOY_TIMEOUT_SEC, gardenEnv } from "../../constants.js"
import type { ExecBuildConfig } from "../exec/build.js"
import type { PluginToolSpec } from "../../plugin/tools.js"
import type { PluginContext } from "../../plugin-context.js"
import { reportDeprecatedFeatureUsage } from "../../util/deprecations.js"

export const CONTAINER_STATUS_CONCURRENCY_LIMIT = gardenEnv.GARDEN_HARD_CONCURRENCY_LIMIT
export const CONTAINER_BUILD_CONCURRENCY_LIMIT_LOCAL = 5
export const CONTAINER_BUILD_CONCURRENCY_LIMIT_CLOUD_BUILDER = 20

export type GardenContainerBuilderConfig = {
  enabled: boolean
}

export interface ContainerProviderConfig extends BaseProviderConfig {
  dockerBuildExtraFlags?: string[]
  gardenContainerBuilder?: GardenContainerBuilderConfig
}

export const gardenContainerBuilderSchema = () =>
  joi
    .object()
    .optional()
    .keys({
      enabled: joi.boolean().default(false).description(dedent`
            Enable Remote Container Builder, which can speed up builds significantly using fast machines and extremely fast caching. When the project is connected and you're logged in to https://app.garden.io the container builder will be enabled by default.

            Under the hood, enabling this option means that Garden will install a remote buildx driver on your local Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/

            In addition to this setting, the environment variable \`GARDEN_CONTAINER_BUILDER\` can be used to override this setting, if enabled in the configuration. Set it to \`false\` or \`0\` to temporarily disable Remote Container Builder.

            If service limits are reached, or Remote Container Builder is not available, Garden will fall back to building images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is configured in the Kubernetes provider configuration.

            Please note that when enabling Container Builder together with in-cluster building, you need to authenticate to your \`deploymentRegistry\` from the local machine (e.g. by running \`docker login\`).
            `),
    })

export const configSchema = () =>
  providerConfigBaseSchema()
    .keys({
      dockerBuildExtraFlags: joi.sparseArray().items(joi.string()).description(dedent`
        Extra flags to pass to the \`docker build\` command. Will extend the \`spec.extraFlags\` specified in each container Build action.
        `),
      // Remote Container Builder
      gardenContainerBuilder: gardenContainerBuilderSchema(),
    })
    .unknown(false)

export type ContainerProvider = Provider<ContainerProviderConfig>
export type ContainerPluginContext = PluginContext<ContainerProviderConfig>

export const dockerVersion = "27.1.1"
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
      sha256: "d2e916f1dfc1a107804d0c1b44242ca2884d5ed07507ec91014648b35459aff4",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://download.docker.com/mac/static/stable/aarch64/docker-${dockerVersion}.tgz`,
      sha256: "a8d011a64b79957f8abe7e3ff56d852352bf9de529d214eee99d1bb1ce3e3d2d",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://download.docker.com/linux/static/stable/x86_64/docker-${dockerVersion}.tgz`,
      sha256: "118da6b8fc8e8b6c086ab0dd5e64ee549376c3a3f963723bbc9a46db475bf21f",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://download.docker.com/linux/static/stable/aarch64/docker-${dockerVersion}.tgz`,
      sha256: "86a395f67a5a23d8eb207ab5a9ab32a51f7fccd8b18dae40887e738db95c6bc4",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/rgl/docker-ce-windows-binaries-vagrant/releases/download/v${dockerVersion}/docker-${dockerVersion}.zip`,
      sha256: "747edbca83e494f160633e07749f4b70ae83c8e81fef36f4b7168048ded64817",
      extract: {
        format: "zip",
        targetPath: "docker/docker.exe",
      },
    },
  ],
}

export const regctlCliVersion = "0.6.1"
export const regctlCliSpec: PluginToolSpec = {
  name: "regctl",
  version: regctlCliVersion,
  description: `Regctl CLI v${regctlCliVersion}`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/regclient/regclient/releases/download/v${regctlCliVersion}/regctl-darwin-amd64`,
      sha256: "916e17019c36ff537555ad9989eb1fcda07403904bc70f808cee9ed9658d4107",
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/regclient/regclient/releases/download/v${regctlCliVersion}/regctl-darwin-arm64`,
      sha256: "28833b2f0b42257e703bf75bfab7dd5baeb52d4a6e3ad8e7d33f754b36b8bb07",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/regclient/regclient/releases/download/v${regctlCliVersion}/regctl-linux-amd64`,
      sha256: "e541327d14c8e6d3a2e4b0dfd76046425a1816879d4f5951042791435dec82e3",
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/regclient/regclient/releases/download/v${regctlCliVersion}/regctl-linux-arm64`,
      sha256: "7c3d760925052f7dea4aa26b327e9d88f3ae30fadacc110ae03bd06df3fb696f",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/regclient/regclient/releases/download/v${regctlCliVersion}/regctl-windows-amd64.exe`,
      sha256: "44b2d5e79ef457e575d2b09bc1f27500cf90b733651793f4e76e23c9b8fc1803",
    },
  ],
}

const progressToolVersion = "0.0.1"
const progressToolSpec: PluginToolSpec = {
  name: "standalone-progressui",
  version: progressToolVersion,
  description: "Helper that utilizes the buildkit library to parse docker logs from progress json output.",
  type: "binary",
  builds: [
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://download.garden.io/standalone-progressui/${progressToolVersion}/standalone-progressui-darwin-arm64`,
      sha256: "633b74d5c37b53757322184e8e453e9982e0615356047e14637d437fa85f0653",
    },
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://download.garden.io/standalone-progressui/${progressToolVersion}/standalone-progressui-darwin-amd64`,
      sha256: "f3d156ecd0ad307e54caa0abe2fe2b42b2b69eb78ff546ff949921b6e232b92c",
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://download.garden.io/standalone-progressui/${progressToolVersion}/standalone-progressui-linux-arm64`,
      sha256: "20a4991f1efc2aae0cca359308feba7e6361a2f92941fdad1f7f14137d94eb6c",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://download.garden.io/standalone-progressui/${progressToolVersion}/standalone-progressui-linux-amd64`,
      sha256: "f3b8534b57939688d5f1ab11d8999d6854b08eef43af1619b641a51bd5f7c8bd",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://download.garden.io/standalone-progressui/${progressToolVersion}/standalone-progressui-windows-amd64`,
      sha256: "c83935be933413ecedb92fb6a70c235670598059dab0d12cc9b4bb0b0f652d25",
    },
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

    return {
      name,
      dependencies: spec.dependencies,
      disabled: spec.disabled,
      spec,
    }
  })

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => {
    return {
      name: t.name,
      dependencies: t.dependencies,
      disabled: t.disabled,
      spec: t,
      timeout: t.timeout,
    }
  })

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => {
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

  // If the module needs container build, we need to add the module version as the tag.
  // If it doesn't need a container build, the module doesn't have a build action and just downloads a prebuilt image
  if (needsContainerBuild && buildAction) {
    // Hack: we are in the container provider, and do not yet have access to kubernetes provider config.
    //  So, we cannot get the info on the deployment container registry.
    //  Thus, we use template string here to reference tje deploymentImageId.
    //  This is safe because module name is validated here,
    //  and the valid module name always results in a valid template expression.
    deploymentImageId = `\${actions.build.${buildAction.name}.outputs.deploymentImageId}`
  }

  function configureActionVolumes(action: ContainerRuntimeActionConfig, volumeSpec: ContainerModuleVolumeSpec[]) {
    volumeSpec.forEach((v) => {
      action.spec.volumes.push(v)
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
      dependencies: prepareRuntimeDependencies(task.spec.dependencies, buildAction),
      timeout: task.spec.timeout,

      spec: {
        ...omit(task.spec, ["name", "description", "dependencies", "disabled", "timeout"]),
        image: deploymentImageId,
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
      dependencies: prepareRuntimeDependencies(test.spec.dependencies, buildAction),
      timeout: test.spec.timeout,

      spec: {
        ...omit(test.spec, ["name", "dependencies", "disabled", "timeout"]),
        image: deploymentImageId,
        volumes: [],
      },
    }
    actions.push(configureActionVolumes(action, test.config.spec.volumes))
  }

  return { actions }
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

  const { actions: runtimeActions } = convertContainerModuleRuntimeActions(params, buildAction, needsContainerBuild)
  actions.push(...runtimeActions)

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
            async configure({ config, log }) {
              if (config.spec["localMode"]) {
                reportDeprecatedFeatureUsage({ log, deprecation: "localMode" })
              }

              return { config, supportedModes: { sync: !!config.spec.sync } satisfies ActionModes }
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

    tools: [dockerSpec, regctlCliSpec, progressToolSpec],
  })

function validateRuntimeCommon(action: Resolved<ContainerRuntimeAction>) {
  const { build } = action.getConfig()

  if (build) {
    throw new ConfigurationError({
      message: `${action.longDescription()} specified the \`build\` field, which is unsupported for container action types. Use \`spec.image\` instead.`,
    })
  }
}
