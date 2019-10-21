/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit } from "lodash"
import { copy, pathExists, readFile, writeFile, ensureDir } from "fs-extra"
import { createGardenPlugin } from "../../types/plugin/plugin"
import {
  ContainerModuleSpec,
  ContainerServiceSpec,
  ContainerTestSpec,
  ContainerModuleConfig,
  ContainerTaskSpec,
  ContainerBuildSpec,
} from "../container/config"
import { joiProviderName, joi } from "../../config/common"
import { Module } from "../../types/module"
import { resolve } from "path"
// import { RuntimeError, ConfigurationError } from "../../exceptions"
import { RuntimeError } from "../../exceptions"
// import { containerHelpers } from "../container/helpers"
import { STATIC_DIR } from "../../constants"
import { containerModuleSpecSchema } from "../container/config"
import { providerConfigBaseSchema } from "../../config/provider"
import { go } from "./go"
import { dedent } from "../../util/string"
import { ModuleConfig, baseBuildSpecSchema } from "../../config/module"
import { ConfigureModuleParams } from "../../types/plugin/module/configure"
import { GetBuildStatusParams } from "../../types/plugin/module/getBuildStatus"
import { BuildModuleParams } from "../../types/plugin/module/build"
import { HotReloadServiceParams } from "../../types/plugin/service/hotReloadService"
import { LogEntry } from "../../logger/log-entry"
import execa = require("execa")
// import { binary } from "@hapi/joi"

const defaultDockerfileName = "go-container.Dockerfile"
const defaultDockerfilePath = resolve(STATIC_DIR, "go-container", defaultDockerfileName)

interface GoContainerBuildSpec extends ContainerBuildSpec {
  debug: boolean
  compress: boolean | number
  // run: string
  // buildFlags: string
}

export interface GoContainerModuleSpec extends ContainerModuleSpec {
  build: GoContainerBuildSpec
}

export type GoContainerModuleConfig = ModuleConfig<GoContainerModuleSpec>

export interface GoContainerModule<
  M extends GoContainerModuleSpec = GoContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec,
  W extends ContainerTaskSpec = ContainerTaskSpec
  > extends Module<M, S, T, W> { }

const goKeys = {
  debug: joi.boolean()
    .description(dedent`
      Go binaries contain DWARFv4 debugging information that can be used to, for example, attach a debugger to a live process.
      By default, Garden passes the '-w' flag to the linker to omit this information and make the resulting binaries smaller.
      If you do want this information, set this option to \`true\`.
    `)
    // .example(true).default(false),
    .example("false"),
  // compress: joi.alternatives().try(
  //     joi.boolean(),
  //     joi.number().integer().min(1).max(9),
  //   ).description(dedent`
  //   By default, Garden will compress the resulting Go binary with UPX \(upx.github.io\).
  //   This can be disabled with \`false\`, or adjusted with
  //   an integer in the 1–9 range, where 1 is fastest and 9 is smaller.
  //   For this functionality to work with macOS, UPX needs
  //   to first be installed with Homebrew using \`brew install upx\`.
  //   `)
  //   .example(1).default(1),
  // buildFlags: joi.string()
  // buildFlags: joi.array().items(joi.string())
    // .description("Use this to pass custom build flags to the Go compiler."),
  // run: joi.array().items(joi.string())
  // run: joi.string()
    // .description("Use this to add arbitrary an arbitrary RUN command to the default Dockerfile."),
  //   .default([" "]), //.example([["apk", "add", "curl"]]),

}

const goContainerModuleSpecSchema = containerModuleSpecSchema.keys({
  build: baseBuildSpecSchema.keys(goKeys),
})
export const goContainerConfigSchema = providerConfigBaseSchema
  .keys({
    name: joiProviderName("go-container"),
  })

export const gardenPlugin = createGardenPlugin({
  name: "go-container",
  dependencies: ["container"],

  // TODO
  // ALSO REFERENCE DOCS
  createModuleTypes: [{
    name: "go-container",
    base: "container",
    docs: dedent`
      A specialized version of the [container](https://docs.garden.io/reference/module-types/container) module type
      that has special semantics for JAR files built with Maven.

      Rather than build the JAR inside the container (or in a multi-stage build) this plugin runs \`mvn package\`
      ahead of building the container, which tends to be much more performant, especially when building locally
      with a warm artifact cache.i

      A default Dockerfile is also provided for convenience, but you may override it by including one in the module
      directory.

      To use it, make sure to add the \`maven-container\` provider to your project configuration.
      The provider will automatically fetch and cache Maven and the appropriate OpenJDK version ahead of building.
    `,
    schema: goContainerModuleSpecSchema,
    handlers: {
      configure: configureGoContainerModule,
      getBuildStatus,
      build,
      hotReloadService,
    },
  }],
})

export async function configureGoContainerModule(params: ConfigureModuleParams<GoContainerModule>) {
  const { base, moduleConfig } = params

  let containerConfig: ContainerModuleConfig = { ...moduleConfig, type: "container" }
  containerConfig.spec = <ContainerModuleSpec>omit(moduleConfig.spec, Object.keys(goKeys))

  containerConfig.spec.hotReload = containerConfig.spec.hotReload || {
    sync: [{ source: "bin", target: "/app" }],
    // sync: [{ source: "bin/binary", target: "/app/binary" }],
  }

  for (const service of containerConfig.spec.services) {
    // service.hotReloadCommand = service.hotReloadCommand || ["ls", "/"]
    service.hotReloadCommand = service.hotReloadCommand || ["/bin/sh", "/app/myscript.sh"]
  }

  const configured = await base!({ ...params, moduleConfig: containerConfig })

  // if vlue="" valiue=default
  // if (!moduleConfig.spec.build.run) {
  //   moduleConfig.spec.build.run = ""
  // }
  // containerConfig.spec.buildArgs = {
  //   EXTRA_RUN: moduleConfig.spec.build.run, //.join(" "),
  // }

  return {
    moduleConfig: {
      ...configured.moduleConfig,
      type: "go-container",
      // exclude: ["vendor"],
      spec: {
        ...configured.moduleConfig.spec,
        build: moduleConfig.spec.build,
        dockerfile: defaultDockerfileName,
      },
    },
  }
}

async function hotReloadService(params: HotReloadServiceParams<GoContainerModule>) {
  const { base, module, log } = params
  await buildBinary(module, log, true)
  console.log("I'm in the hotReloadService function.")
  return base!(params)
}

async function build(params: BuildModuleParams<GoContainerModule>) {
  const { base, module, log } = params
  await buildBinary(module, log, false)
  return base!(params)
}

async function getBuildStatus(params: GetBuildStatusParams<GoContainerModule>) {
  // const { base, module, log } = params
  const { base } = params
  return base!(params)
}

async function buildBinary(module: GoContainerModule, log: LogEntry, hotReload: boolean) {
// GoContainerModule<GoContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec, ContainerTaskSpec>
  // let { debug, compress, buildFlags, run } = module.spec
  let { debug } = module.spec.build

  const status = log.info(`Starting Go build process...`)

  // Check if any imports have changed
  status.setState(`Checking for new dependencies...`)
  let tidy
  try {
  tidy = await go.exec({
    args: ["mod", "tidy"],
    cwd: module.path,
    log,
  })
} catch (err) {
  console.log(err.stderr)
  status.setState(err.stderr)
}
console.log(tidy.stdout)

  // If they did, update the vendor directory
  if (tidy.stdout) {
  status.setState(`Downloading new dependencies...`)
    await go.exec({
      args: ["mod", "vendor"],
      cwd: module.path,
      log,
    })
  }

    await ensureDir(resolve(module.path, "bin"))

  let buildArgs = [
    "build",
    "-o",
    "bin/binary",
    "-mod=vendor",
    // buildFlags,
  ]

  const debugArgs = [
     "-ldflags",
     "'-w'",
  ]

  if (debug) {
    buildArgs = buildArgs.concat(debugArgs)
  }

  status.setState(`Building Go binary...`)
  let goOutput: any = "default go"
  try {
    console.log("Module dot build path:", module.buildPath)
    // let goOutput = await execa("mkdir", ["foo" + Math.random()], {cwd: module.buildPath})
  goOutput = await go.exec({
    args: buildArgs,
    cwd: hotReload ? module.path : module.buildPath,
    log,
    env: {
      CGO_ENABLED: "0",
      GOOS: "linux",
      // GOCACHE: resolve(module.buildPath, "cache"),
    },
  })
  } catch (err) {
    console.log(err.stdout)
  status.setState(err.stderr)
  }

    console.log("goOutput:", goOutput.stdout)
  // if (compress != "") {
  //   await upx.exec({
  //     args: ["mod", "vendor"],
  //     cwd: module.path,
  //     log,
  //   })
  // }
  const dockerFileBuild = resolve(module.buildPath, defaultDockerfileName)
  await copy(defaultDockerfilePath, dockerFileBuild)

  const scriptName = "myscript.sh"
  const scriptPath = resolve(STATIC_DIR, "go-container", scriptName)
  const scriptBuild = resolve(module.buildPath, "bin", scriptName)
  await copy(scriptPath, scriptBuild)

// if (run != "") {
  // let dockerFile = await readFile(dockerFileBuild, "utf8")
//   dockerFile = dockerFile.replace(/echo/g, run)
//   try {
//   await writeFile(dockerFileBuild, dockerFile, "utf8")
//   } catch (err) {
//     console.log(err)
//   }
// }

  // Copy the artifact to the module build directory
  const binaryPath = resolve(module.buildPath, "bin/binary")

  if (!(await pathExists(binaryPath))) {
    throw new RuntimeError(
      `Could not find artifact at: ${binaryPath}'`,
      { binaryPath },
    )
  }

}
