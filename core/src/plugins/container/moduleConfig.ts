/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenModule } from "../../types/module.js"
import type { PrimitiveMap } from "../../config/common.js"
import { joi, joiModuleIncludeDirective, joiSparseArray } from "../../config/common.js"
import type { ModuleSpec, ModuleConfig } from "../../config/module.js"
import { baseBuildSpecSchema } from "../../config/module.js"
import type { CommonServiceSpec } from "../../config/service.js"
import { baseServiceSpecSchema } from "../../config/service.js"
import type { BaseTaskSpec } from "../../config/task.js"
import { baseTaskSpecSchema } from "../../config/task.js"
import type { BaseTestSpec } from "../../config/test.js"
import { baseTestSpecSchema } from "../../config/test.js"
import { dedent, deline } from "../../util/string.js"
import type {
  ContainerCommonDeploySpec,
  ContainerRunActionSpec,
  ContainerTestActionSpec,
  ContainerVolumeSpecBase,
} from "./config.js"
import {
  containerBuildOutputSchemaKeys,
  containerCommonBuildSpecKeys,
  containerDeploySchemaKeys,
  containerSyncPathSchema,
  containerRunSpecKeys,
  containerTestSpecKeys,
  getContainerVolumesSchema,
  volumeSchemaBase,
} from "./config.js"
import { kebabCase, mapKeys } from "lodash-es"

/**
 * PLEASE DO NOT UPDATE THESE SCHEMAS UNLESS ABSOLUTELY NECESSARY, AND IF YOU DO, MAKE SURE
 * CHANGES ARE REFLECTED IN THE CORRESPONDING ACTION SPECS + CONVERSION HANDLER.
 */

// To reduce the amount of edits to make before removing module configs
export * from "./config.js"

export interface ContainerModuleVolumeSpec extends ContainerVolumeSpecBase {}

export type ContainerServiceSpec = CommonServiceSpec &
  ContainerCommonDeploySpec & {
    volumes: ContainerModuleVolumeSpec[]
  }

export type ContainerTestSpec = BaseTestSpec &
  ContainerTestActionSpec & {
    volumes: ContainerModuleVolumeSpec[]
  }
export const containerModuleTestSchema = () =>
  baseTestSpecSchema().keys({
    ...containerTestSpecKeys(),
    image: moduleRuntimeContainerImageSchema(),
    volumes: moduleVolumesSchema().default([]),
  })

export type ContainerTaskSpec = BaseTaskSpec &
  ContainerRunActionSpec & {
    volumes: ContainerModuleVolumeSpec[]
  }
export const containerTaskSchema = () =>
  baseTaskSpecSchema()
    .keys({ ...containerRunSpecKeys(), image: moduleRuntimeContainerImageSchema(), volumes: moduleVolumesSchema() })
    .description("A task that can be run in the container.")

export interface ContainerModuleBuildSpec {
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

export type ContainerModuleConfig = ModuleConfig<ContainerModuleSpec>

export const defaultTag = "latest"

const containerBuildSpecSchema = () =>
  baseBuildSpecSchema().keys({
    targetImage: joi.string().description(deline`
      For multi-stage Dockerfiles, specify which image/stage to build (see
      https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for
      details).
    `),
  })

const moduleVolumesSchema = () =>
  getContainerVolumesSchema(volumeSchemaBase()).description(dedent`
    List of volumes that should be mounted when starting the container.

    Note: If neither \`hostPath\` nor \`module\` is specified,
    an empty ephemeral volume is created and mounted when deploying the container.
`)

// image is required in the action deploy schema, but optional in module schema
const moduleRuntimeContainerImageSchema = () =>
  joi.string().allow(false, null).empty([false, null]).description(deline`
  Specify an image ID to deploy. Should be a valid Docker image identifier. Not required if the module has a Dockerfile.
`)

const containerServiceSchema = () =>
  baseServiceSpecSchema()
    .keys({
      ...containerDeploySchemaKeys(),
      image: moduleRuntimeContainerImageSchema(),
      sync: containerSyncPathSchema(),
      volumes: moduleVolumesSchema(),
    })
    // Module configs are deprecated, so we keep syntax translation in module configs
    .rename("devMode", "sync")

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
      hotReload: joi.any().meta({
        internal: true,
        // no need to compose deprecation message here, because thid field is hidden and does not appear in the reference docs
      }),
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

export type ContainerModule<
  M extends ContainerModuleSpec = ContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec,
  W extends ContainerTaskSpec = ContainerTaskSpec,
  O extends ContainerModuleOutputs = ContainerModuleOutputs,
> = GardenModule<M, S, T, W, O>
