/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { keyBy } from "lodash"

import { ConfigurationError } from "../../exceptions"
import { createGardenPlugin } from "../../plugin/plugin"
import { containerHelpers, defaultDockerfileName } from "./helpers"
import {
  ContainerActionConfig,
  ContainerBuildActionConfig,
  ContainerModule,
  containerModuleOutputsSchema,
  containerModuleSpecSchema,
} from "./moduleConfig"
import { buildContainer, getContainerBuildActionOutputs, getContainerBuildStatus } from "./build"
import { ConfigureModuleParams } from "../../plugin/handlers/module/configure"
import { SuggestModulesParams, SuggestModulesResult } from "../../plugin/handlers/module/suggest"
import { listDirectory } from "../../util/fs"
import { dedent } from "../../util/string"
import { Provider, GenericProviderConfig, providerConfigBaseSchema } from "../../config/provider"
import { GetModuleOutputsParams } from "../../plugin/handlers/module/get-outputs"
import { ConvertModuleParams } from "../../plugin/handlers/module/convert"
import { ExecActionConfig, ExecBuildConfig } from "../exec/config"
import {
  containerBuildOutputsSchema,
  containerDeploySchema,
  containerRunActionSchema,
  containerTestActionSchema,
  containerBuildSpecSchema,
  containerDeployOutputsSchema,
  containerTestOutputSchema,
  containerRunOutputSchema,
  ContainerDeployAction,
  ContainerRunAction,
  ContainerTestAction,
  ContainerRuntimeAction,
  ContainerBuildAction,
} from "./config"
import { publishContainerBuild } from "./publish"
import {
  BuildActionDefinition,
  DeployActionDefinition,
  RunActionDefinition,
  TestActionDefinition,
} from "../../plugin/action-types"
import { Resolved } from "../../actions/types"
import { getDeployedImageId } from "../kubernetes/container/util"
import { KubernetesProvider } from "../kubernetes/config"
import { DeepPrimitiveMap } from "../../config/common"

export interface ContainerProviderConfig extends GenericProviderConfig {}

export type ContainerProvider = Provider<ContainerProviderConfig>

// TODO: remove in 0.14. validation should be in the action validation handler.
export async function configureContainerModule({ log, moduleConfig }: ConfigureModuleParams<ContainerModule>) {
  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((spec) => {
    // make sure ports are correctly configured
    const name = spec.name
    const definedPorts = spec.ports
    const portsByName = keyBy(spec.ports, "name")

    for (const ingress of spec.ingresses) {
      const ingressPort = ingress.port

      if (!portsByName[ingressPort]) {
        throw new ConfigurationError(`Service ${name} does not define port ${ingressPort} defined in ingress`, {
          definedPorts,
          ingressPort,
        })
      }
    }

    if (spec.healthCheck && spec.healthCheck.httpGet) {
      const healthCheckHttpPort = spec.healthCheck.httpGet.port

      if (!portsByName[healthCheckHttpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check`,
          { definedPorts, healthCheckHttpPort }
        )
      }
    }

    if (spec.healthCheck && spec.healthCheck.tcpPort) {
      const healthCheckTcpPort = spec.healthCheck.tcpPort

      if (!portsByName[healthCheckTcpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check`,
          { definedPorts, healthCheckTcpPort }
        )
      }
    }

    for (const volume of spec.volumes) {
      if (volume.module) {
        // TODO-G2: change this to validation instead, require explicit dependency
        moduleConfig.build.dependencies.push({ name: volume.module, copy: [] })
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
        moduleConfig.build.dependencies.push({ name: volume.module, copy: [] })
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
        moduleConfig.build.dependencies.push({ name: volume.module, copy: [] })
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

async function suggestModules({ name, path }: SuggestModulesParams): Promise<SuggestModulesResult> {
  const dockerfiles = (await listDirectory(path, { recursive: false })).filter(
    (filename) => filename.startsWith(defaultDockerfileName) || filename.endsWith(defaultDockerfileName)
  )

  return {
    suggestions: dockerfiles.map((dockerfileName) => {
      return {
        description: `based on found ${chalk.white(dockerfileName)}`,
        module: {
          kind: "Module",
          type: "container",
          name,
          dockerfile: dockerfileName,
        },
      }
    }),
  }
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

export function convertContainerModuleRuntimeActions(
  convertParams: ConvertModuleParams<ContainerModule>,
  buildAction: ContainerBuildActionConfig | ExecBuildConfig | undefined,
  needsContainerBuild: boolean
): ContainerActionConfig[] {
  const { module, prepareRuntimeDependencies } = convertParams
  const actions: ContainerActionConfig[] = []
  for (const service of module.serviceConfigs) {
    actions.push({
      kind: "Deploy",
      type: "container",
      name: service.name,
      ...convertParams.baseFields,

      disabled: service.disabled,
      build: buildAction?.name,
      dependencies: prepareRuntimeDependencies(service.spec.dependencies, buildAction),

      spec: {
        ...service.spec,
      },
    })
  }

  for (const task of module.taskConfigs) {
    actions.push({
      kind: "Run",
      type: "container",
      name: task.name,
      ...convertParams.baseFields,

      disabled: task.disabled,
      build: buildAction?.name,
      dependencies: prepareRuntimeDependencies(task.spec.dependencies, buildAction),
      timeout: task.spec.timeout ? task.spec.timeout : undefined,

      spec: {
        ...task.spec,
        image: needsContainerBuild ? undefined : module.spec.image,
      },
    })
  }

  for (const test of module.testConfigs) {
    actions.push({
      kind: "Test",
      type: "container",
      name: module.name + "-" + test.name,
      ...convertParams.baseFields,

      disabled: test.disabled,
      build: buildAction?.name,
      dependencies: prepareRuntimeDependencies(test.spec.dependencies, buildAction),
      timeout: test.spec.timeout ? test.spec.timeout : undefined,

      spec: {
        ...test.spec,
        image: needsContainerBuild ? undefined : module.spec.image,
      },
    })
  }

  return actions
}

export async function convertContainerModule(params: ConvertModuleParams<ContainerModule>) {
  const { module, convertBuildDependency, dummyBuild } = params
  const actions: (ContainerActionConfig | ExecActionConfig)[] = []

  let needsContainerBuild = false

  if (containerHelpers.moduleHasDockerfile(module, module.version)) {
    needsContainerBuild = true
  }

  let buildAction: ContainerActionConfig | ExecActionConfig | undefined = undefined

  if (needsContainerBuild) {
    buildAction = {
      kind: "Build",
      type: "container",
      name: module.name,
      ...params.baseFields,

      copyFrom: dummyBuild?.copyFrom,
      allowPublish: module.allowPublish,
      dependencies: module.build.dependencies.map(convertBuildDependency),

      spec: {
        buildArgs: module.spec.buildArgs,
        dockerfile: module.spec.dockerfile || defaultDockerfileName,
        extraFlags: module.spec.extraFlags,
        localId: module.spec.image,
        publishId: module.spec.image,
        targetStage: module.spec.build.targetImage,
        timeout: module.spec.build.timeout,
      },
    }
    actions.push(buildAction)
  } else if (dummyBuild) {
    buildAction = dummyBuild
    actions.push(buildAction)
  }

  const runtimeActions = convertContainerModuleRuntimeActions(params, buildAction, needsContainerBuild)
  actions.push(...runtimeActions)

  return {
    group: {
      // This is an annoying TypeScript limitation :P
      kind: <"Group">"Group",
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
    configSchema: providerConfigBaseSchema(),

    createActionTypes: {
      Build: [
        <BuildActionDefinition<ContainerBuildAction>>{
          name: "container",
          docs: dedent`
            Build a Docker container image, and (if applicable) push to a remote registry.
          `,
          outputs: {
            schema: containerBuildOutputsSchema(),
            staticKeys: true,
          },
          schema: containerBuildSpecSchema(),
          handlers: {
            async getOutputs({ action }) {
              // TODO-G2B: figure out why this cast is needed here
              return {
                outputs: (getContainerBuildActionOutputs(action) as unknown) as DeepPrimitiveMap,
              }
            },

            build: buildContainer,
            getStatus: getContainerBuildStatus,
            publish: publishContainerBuild,
          },
        },
      ],
      Deploy: [
        <DeployActionDefinition<ContainerDeployAction>>{
          name: "container",
          docs: dedent`
            Deploy a container image, e.g. in a Kubernetes namespace (when used with the \`kubernetes\` provider).

            This is a simplified abstraction, which can be convenient for simple deployments, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Deploy types like [helm](./helm.md) or [kubernetes](./kubernetes.md).
          `,
          schema: containerDeploySchema(),
          outputs: {
            schema: containerDeployOutputsSchema(),
            staticKeys: true,
          },
          handlers: {
            // Other handlers are implemented by other providers (e.g. kubernetes)

            async validate({ action }) {
              // make sure ports are correctly configured
              const spec = action.getSpec()
              const definedPorts = spec.ports
              const portsByName = keyBy(spec.ports, "name")

              for (const ingress of spec.ingresses) {
                const ingressPort = ingress.port

                if (!portsByName[ingressPort]) {
                  throw new ConfigurationError(
                    `${action.longDescription()} does not define port ${ingressPort} defined in ingress`,
                    {
                      definedPorts,
                      ingressPort,
                    }
                  )
                }
              }

              if (spec.healthCheck && spec.healthCheck.httpGet) {
                const healthCheckHttpPort = spec.healthCheck.httpGet.port

                if (!portsByName[healthCheckHttpPort]) {
                  throw new ConfigurationError(
                    `${action.longDescription()} does not define port ${healthCheckHttpPort} defined in httpGet health check`,
                    { definedPorts, healthCheckHttpPort }
                  )
                }
              }

              if (spec.healthCheck && spec.healthCheck.tcpPort) {
                const healthCheckTcpPort = spec.healthCheck.tcpPort

                if (!portsByName[healthCheckTcpPort]) {
                  throw new ConfigurationError(
                    `${action.longDescription()} does not define port ${healthCheckTcpPort} defined in tcpPort health check`,
                    { definedPorts, healthCheckTcpPort }
                  )
                }
              }

              for (const volume of spec.volumes) {
                if (volume.action && !action.hasDependency(volume.action)) {
                  throw new ConfigurationError(
                    `${action.longDescription()} references action ${
                      volume.action
                    } under \`spec.volumes\` but does not declare a dependency on it. Please add an explicit dependency on the volume action.`,
                    { spec }
                  )
                }
              }

              return {}
            },

            async getOutputs({ ctx, action }) {
              const provider = ctx.provider as KubernetesProvider
              return {
                outputs: {
                  deployedImageId: getDeployedImageId(action, provider),
                },
              }
            },
          },
        },
      ],
      Run: [
        <RunActionDefinition<ContainerRunAction>>{
          name: "container",
          docs: dedent`
            Run a command in a container image, e.g. in a Kubernetes namespace (when used with the \`kubernetes\` provider).

            This is a simplified abstraction, which can be convenient for simple tasks, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Run types like [helm](./helm.md) or [kubernetes](./kubernetes.md).
          `,
          schema: containerRunActionSchema(),
          outputs: {
            schema: containerRunOutputSchema(),
          },
          handlers: {
            // Implemented by other providers (e.g. kubernetes)
            async validate({ action }) {
              validateCommon(action)
              return {}
            },
          },
        },
      ],
      Test: [
        <TestActionDefinition<ContainerTestAction>>{
          name: "container",
          docs: dedent`
            Define a Test which runs a command in a container image, e.g. in a Kubernetes namespace (when used with the \`kubernetes\` provider).

            This is a simplified abstraction, which can be convenient for simple scenarios, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Test types like [helm](./helm.md) or [kubernetes](./kubernetes.md).
          `,
          schema: containerTestActionSchema(),
          outputs: {
            schema: containerTestOutputSchema(),
          },
          handlers: {
            // Implemented by other providers (e.g. kubernetes)
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
          suggestModules,
          getModuleOutputs: getContainerModuleOutputs,
          convert: convertContainerModule,
        },
      },
    ],

    tools: [
      {
        name: "docker",
        description: "The official Docker CLI.",
        type: "binary",
        _includeInGardenImage: true,
        builds: [
          {
            platform: "darwin",
            architecture: "amd64",
            url: "https://download.docker.com/mac/static/stable/x86_64/docker-20.10.9.tgz",
            sha256: "f045f816579a96a45deef25aaf3fc116257b4fb5782b51265ad863dcae21f879",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "linux",
            architecture: "amd64",
            url: "https://download.docker.com/linux/static/stable/x86_64/docker-20.10.9.tgz",
            sha256: "caf74e54b58c0b38bb4d96c8f87665f29b684371c9a325562a3904b8c389995e",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "windows",
            architecture: "amd64",
            url:
              "https://github.com/rgl/docker-ce-windows-binaries-vagrant/releases/download/v20.10.9/docker-20.10.9.zip",
            sha256: "360ca42101d453022eea17747ae0328709c7512e71553b497b88b7242b9b0ee4",
            extract: {
              format: "zip",
              targetPath: "docker/docker.exe",
            },
          },
        ],
      },
    ],
  })

function validateCommon(action: Resolved<ContainerRuntimeAction>) {
  const { build } = action.getConfig()
  const { image } = action.getSpec()

  if (!build && !image) {
    throw new ConfigurationError(`${action.longDescription()} must specify one of \`build\` or \`spec.image\``, {
      actionKey: action.key(),
    })
  } else if (build && image) {
    throw new ConfigurationError(
      `${action.longDescription()} specifies both \`build\` and \`spec.image\`. Only one may be specified.`,
      {
        actionKey: action.key(),
      }
    )
  } else if (build) {
    const buildAction = action.getDependency({ kind: "Build", name: build })
    if (buildAction && !buildAction?.isCompatible("container")) {
      throw new ConfigurationError(
        `${action.longDescription()} build field must specify a container Build, or a compatible type.`,
        {
          actionKey: action.key(),
          buildActionName: build,
        }
      )
    }
  }
}
