/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenModule } from "../../types/module"
import { PrimitiveMap, joi, joiModuleIncludeDirective, joiSparseArray, joiIdentifier } from "../../config/common"
import { GardenService } from "../../types/service"
import { ModuleSpec, ModuleConfig, baseBuildSpecSchema, BaseBuildSpec } from "../../config/module"
import { baseServiceSpecSchema, CommonServiceSpec, ServiceConfig } from "../../config/service"
import { baseTaskSpecSchema, BaseTaskSpec } from "../../config/task"
import { baseTestSpecSchema, BaseTestSpec } from "../../config/test"
import { dedent, deline } from "../../util/string"
import {
  containerBuildOutputSchemaKeys,
  containerCommonBuildSpecKeys,
  ContainerCommonDeploySpec,
  containerDeploySchemaKeys,
  containerDevModeSchema,
  ContainerRunActionSpec,
  containerRunSpecKeys,
  ContainerTestActionSpec,
  containerTestSpecKeys,
  ContainerVolumeSpecBase,
  getContainerVolumesSchema,
  volumeSchemaBase,
} from "./config"
import { kebabCase, mapKeys } from "lodash"

/**
 * PLEASE DO NOT UPDATE THESE SCHEMAS UNLESS ABSOLUTELY NECESSARY, AND IF YOU DO, MAKE SURE
 * CHANGES ARE REFLECTED IN THE CORRESPONDING ACTION SPECS + CONVERSION HANDLER.
 */

// To reduce the amount of edits to make before removing module configs
export * from "./config"

interface ContainerModuleVolumeSpec extends ContainerVolumeSpecBase {
  module?: string
}

export type ContainerServiceSpec = CommonServiceSpec &
  ContainerCommonDeploySpec & {
    volumes: ContainerModuleVolumeSpec[]
  }
export type ContainerServiceConfig = ServiceConfig<ContainerServiceSpec>

export interface ContainerService extends GardenService<ContainerModule> {}

export type ContainerTestSpec = BaseTestSpec &
  ContainerTestActionSpec & {
    volumes: ContainerModuleVolumeSpec[]
  }
export const containerModuleTestSchema = () => baseTestSpecSchema().keys(containerTestSpecKeys())

export type ContainerTaskSpec = BaseTaskSpec &
  ContainerRunActionSpec & {
    volumes: ContainerModuleVolumeSpec[]
  }
export const containerTaskSchema = () =>
  baseTaskSpecSchema().keys(containerRunSpecKeys()).description("A task that can be run in the container.")

export interface ContainerModuleBuildSpec extends BaseBuildSpec {
  targetImage?: string
  timeout: number
}

export interface ContainerModuleSpec extends ModuleSpec {
  build: ContainerModuleBuildSpec
  buildArgs: PrimitiveMap
  extraFlags: string[]
  image?: string
  dockerfile?: string
  services: ContainerServiceSpec[]
  tests: ContainerTestSpec[]
  tasks: ContainerTaskSpec[]
}

export interface ContainerModuleConfig extends ModuleConfig<ContainerModuleSpec> {}

export const defaultImageNamespace = "_"
export const defaultTag = "latest"

const containerBuildSpecSchema = () =>
  baseBuildSpecSchema().keys({
    target: joi.string().description(deline`
      For multi-stage Dockerfiles, specify which image/stage to build (see
      https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for
      details).
    `),
  })

const containerServiceSchema = () =>
  baseServiceSpecSchema().keys({
    ...containerDeploySchemaKeys(),
    devMode: containerDevModeSchema(),
    volumes: getContainerVolumesSchema(
      volumeSchemaBase()
        .keys({
          module: joiIdentifier().description(
            dedent`
            The name of a _volume module_ that should be mounted at \`containerPath\`. The supported module types will depend on which provider you are using. The \`kubernetes\` provider supports the [persistentvolumeclaim module](./persistentvolumeclaim.md), for example.

            When a \`module\` is specified, the referenced module/volume will be automatically configured as a runtime dependency of this service, as well as a build dependency of this module.

            Note: Make sure to pay attention to the supported \`accessModes\` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.
            `
          ),
        })
        .oxor("hostPath", "module")
    ),
  })

// TODO-G2: peel out build action keys
export const containerModuleSpecSchema = () =>
  joi
    .object()
    .keys({
      build: containerBuildSpecSchema(),
      ...containerCommonBuildSpecKeys(),
      // TODO: validate the image name format
      image: joi.string().allow(false, null).empty([false, null]).description(deline`
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
      // TODO: remove in 0.14, keeping around to avoid config failures
      hotReload: joi.any().meta({ internal: true }),
      dockerfile: joi
        .posixPath()
        .subPathOnly()
        .allow(false, null)
        .empty([false, null])
        .description("POSIX-style name of a Dockerfile, relative to module root."),
      services: joiSparseArray(containerServiceSchema())
        .unique("name")
        .description("A list of services to deploy from this container module."),
      tests: joiSparseArray(containerModuleTestSchema()).description("A list of tests to run in the module."),
      // We use the user-facing term "tasks" as the key here, instead of "tasks".
      tasks: joiSparseArray(containerTaskSchema()).description(deline`
        A list of tasks that can be run from this container module. These can be used as dependencies for services
        (executed before the service is deployed) or for other tasks.
      `),
    })
    .description("Configuration for a container module.")

export interface ContainerModuleOutputs {
  "local-image-name": string
  "local-image-id": string
  "deployment-image-name": string
  "deployment-image-id": string
}

export const containerModuleOutputsSchema = () =>
  joi.object().keys(mapKeys(containerBuildOutputSchemaKeys(), (_, k) => kebabCase(k)))

export interface ContainerModule<
  M extends ContainerModuleSpec = ContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec,
  W extends ContainerTaskSpec = ContainerTaskSpec,
  O extends ContainerModuleOutputs = ContainerModuleOutputs
> extends GardenModule<M, S, T, W, O> {}
