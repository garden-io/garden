/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, posix } from "path"
import fsExtra from "fs-extra"
import semver from "semver"
import type { CommandEntry } from "docker-file-parser"
import { parse } from "docker-file-parser"
import isGlob from "is-glob"
import { ConfigurationError, GardenError, RuntimeError } from "../../exceptions.js"
import type { SpawnOutput } from "../../util/util.js"
import { spawn } from "../../util/util.js"
import type { ContainerBuildOutputs, ContainerModuleConfig, ContainerRegistryConfig } from "./moduleConfig.js"
import { defaultTag as _defaultTag } from "./moduleConfig.js"
import type { Writable } from "stream"
import { flatten, fromPairs, reduce, uniq } from "lodash-es"
import type { ActionLog, Log } from "../../logger/log-entry.js"

import isUrl from "is-url"
import titleize from "titleize"
import { deline, splitFirst, splitLast, stripQuotes } from "../../util/string.js"
import type { PluginContext } from "../../plugin-context.js"
import type { ModuleVersion } from "../../vcs/vcs.js"
import type { ContainerBuildAction } from "./config.js"
import { defaultDockerfileName } from "./config.js"
import { joinWithPosix } from "../../util/fs.js"
import type { Resolved } from "../../actions/types.js"
import pMemoize from "../../lib/p-memoize.js"
import { styles } from "../../logger/styles.js"
import type { ContainerProviderConfig } from "./container.js"
import type { MaybeSecret } from "../../util/secrets.js"

const { readFile, pathExists, lstat } = fsExtra

interface DockerVersion {
  client?: string
  server?: string
}

export const minDockerVersion = {
  client: "19.03.0",
  server: "17.07.0",
} as const

interface ParsedImageId {
  host?: string
  namespace?: string
  repository: string
  tag?: string
}

// TODO: This is done to make it easy to stub when testing.
// We should come up with a better way than exporting this object.
const helpers = {
  /**
   * Returns the image ID used locally, when building and deploying to local environments
   * (when we don't need to push to remote registries).
   */
  getLocalImageId(buildName: string, explicitImageId: string | undefined, version: ModuleVersion): string {
    const { versionString } = version
    const name = helpers.getLocalImageName(buildName, explicitImageId)
    const parsedImage = helpers.parseImageId(name)
    return helpers.unparseImageId({ ...parsedImage, tag: versionString })
  },

  /**
   * Returns the image name used locally (without tag/version), when building and deploying to local environments
   * (when we don't need to push to remote registries).
   */
  getLocalImageName(buildName: string, explicitImageId: string | undefined): string {
    if (explicitImageId) {
      const parsedImage = helpers.parseImageId(explicitImageId)
      return helpers.unparseImageId({ ...parsedImage, tag: undefined })
    } else {
      return buildName
    }
  },

  /**
   * Returns the image ID to be used for publishing to container registries
   * (not to be confused with the ID used when pushing to private deployment registries).
   *
   * The tag on the identifier will be set as one of (in order of precedence):
   * - The `tagOverride` argument explicitly set (e.g. --tag option provided to the garden publish command).
   * - The tag  part of the `spec.publishId` from the action configuration, if one is set, and it includes a tag part.
   * - The Garden version of the module.
   */
  getPublicImageId(action: Resolved<ContainerBuildAction>, log: Log, tagOverride?: string) {
    // TODO: allow setting a default user/org prefix in the project/plugin config
    const explicitPublishId = action.getSpec("publishId")

    let parsedImage: ParsedImageId
    let publishTag = tagOverride

    if (explicitPublishId) {
      // Getting the tag like this because it's otherwise defaulted to "latest"
      const imageTag = splitFirst(explicitPublishId, ":")[1]
      if (!publishTag) {
        publishTag = imageTag
      }

      parsedImage = helpers.parseImageId(explicitPublishId)
    } else {
      const explicitImage = action.getSpec("localId")
      // If localId is explicitly set we use that as the image name
      // Otherwise we use the actions deploymentImageName output, which includes the registry
      // if that is specificed in the kubernetes provider.
      const publishImageName = this.getLocalImageName(action.getOutput("deployment-image-name"), explicitImage)

      parsedImage = helpers.parseImageId(publishImageName)
    }

    if (!publishTag) {
      publishTag = action.versionString(log)
    }
    return helpers.unparseImageId({ ...parsedImage, tag: publishTag })
  },

  /**
   * Returns the image name (sans tag/version) to be used when pushing to deployment registries.
   */
  getDeploymentImageName(
    buildName: string,
    explicitImageId: string | undefined,
    registryConfig: ContainerRegistryConfig | undefined
  ) {
    const localImageName = explicitImageId || buildName
    const parsedImageId = helpers.parseImageId(localImageName)

    if (!registryConfig) {
      return helpers.unparseImageId({
        ...parsedImageId,
        tag: undefined,
      })
    }

    const host = registryConfig.port ? `${registryConfig.hostname}:${registryConfig.port}` : registryConfig.hostname

    return helpers.unparseImageId({
      host,
      namespace: registryConfig.namespace,
      repository: parsedImageId.repository,
      tag: undefined,
    })
  },

  /**
   * Returns the image ID to be used when pushing to deployment registries.
   * This always has the version set as the tag.
   * Do not confuse this with the publishing image ID used by the `garden publish` command.
   */
  getBuildDeploymentImageId(
    buildName: string,
    explicitImage: string | undefined,
    version: ModuleVersion,
    // Requiring this parameter to avoid accidentally missing it
    registryConfig: ContainerRegistryConfig | undefined
  ): string {
    const imageName = helpers.getDeploymentImageName(buildName, explicitImage, registryConfig)

    return helpers.unparseImageId({
      repository: imageName,
      tag: version.versionString,
    })
  },

  getModuleDeploymentImageId(
    moduleConfig: ContainerModuleConfig,
    version: ModuleVersion,
    // Requiring this parameter to avoid accidentally missing it
    registryConfig: ContainerRegistryConfig | undefined
  ): string {
    // The `dockerfile` configuration always takes precedence over the `image`.
    if (helpers.moduleHasDockerfile(moduleConfig, version)) {
      return helpers.getBuildDeploymentImageId(moduleConfig.name, moduleConfig.spec.image, version, registryConfig)
    }

    // Return the configured image ID if no Dockerfile is defined in the config.
    if (moduleConfig.spec.image) {
      return moduleConfig.spec.image
    }

    throw new ConfigurationError({
      message: `Module ${moduleConfig.name} neither specifies image nor can a Dockerfile be found in the module directory.`,
    })
  },

  /**
   * Serves build action outputs in container and kubernetes plugins.
   */
  getBuildActionOutputs(
    action: Resolved<ContainerBuildAction>,
    // Requiring this parameter to avoid accidentally missing it
    registryConfig: ContainerRegistryConfig | undefined,
    log: Log
  ): ContainerBuildOutputs {
    const localId = action.getSpec("localId")
    const version = action.moduleVersion(log)
    const buildName = action.name

    const localImageName = containerHelpers.getLocalImageName(buildName, localId)
    const localImageId = containerHelpers.getLocalImageId(buildName, localId, version)

    const deploymentImageName = containerHelpers.getDeploymentImageName(buildName, localId, registryConfig)
    const deploymentImageId = containerHelpers.getBuildDeploymentImageId(buildName, localId, version, registryConfig)

    return {
      localImageName,
      localImageId,
      deploymentImageName,
      deploymentImageId,
      "deploymentImageTag": version.versionString,
      "local-image-name": localImageName,
      "local-image-id": localImageId,
      "deployment-image-name": deploymentImageName,
      "deployment-image-id": deploymentImageId,
      "deployment-image-tag": version.versionString,
    }
  },

  parseImageId(imageId: string, defaultTag = _defaultTag): ParsedImageId {
    let [name, tag] = splitLast(imageId, ":")

    if (name === "") {
      name = tag || ""
      tag = defaultTag
    }

    const parts = name.length > 0 ? name.split("/") : []

    if (!tag) {
      tag = defaultTag
    }

    if (parts.length === 1) {
      return {
        repository: parts[0],
        tag,
      }
    } else if (parts.length === 2) {
      return {
        namespace: parts[0],
        repository: parts[1],
        tag,
      }
    } else if (parts.length === 3) {
      return {
        host: parts[0],
        namespace: parts[1],
        repository: parts[2],
        tag,
      }
    } else if (parts.length > 3) {
      return {
        host: parts[0],
        namespace: parts.slice(1, parts.length - 1).join("/"),
        repository: parts[parts.length - 1],
        tag,
      }
    } else {
      throw new ConfigurationError({
        message: `Invalid container image tag: ${imageId}`,
      })
    }
  },

  unparseImageId(parsed: ParsedImageId) {
    const name = parsed.tag ? `${parsed.repository}:${parsed.tag}` : parsed.repository

    if (parsed.host) {
      return `${parsed.host}/${parsed.namespace ? parsed.namespace + "/" : ""}${name}`
    } else if (parsed.namespace) {
      return `${parsed.namespace}/${name}`
    } else {
      return name
    }
  },

  // Verifies the existance of a local image with the given identifier
  // and returns the identifier with a list of corresponding image IDs
  async getLocalImageInfo(
    identifier: string,
    log: Log,
    ctx: PluginContext
  ): Promise<{ identifier: string; imageIds: string[] } | undefined> {
    const result = await helpers.dockerCli({
      cwd: ctx.projectRoot,
      args: ["images", identifier, "-q"],
      log,
      ctx,
    })

    if (result.stdout!.length === 0) {
      return undefined
    }

    const imageIds = result.stdout.split("\n")
    return { identifier, imageIds }
  },

  // Remove all images for a given identifier
  async removeLocalImage(identifier: string, log: Log, ctx: PluginContext) {
    const { imageIds } = (await containerHelpers.getLocalImageInfo(identifier, log, ctx)) || {}

    if (!imageIds) {
      return undefined
    }

    const result = await helpers.dockerCli({
      cwd: ctx.projectRoot,
      args: ["rmi", "--force", imageIds.join(" ").trim()],
      log,
      ctx,
    })

    if (result.stdout!.length === 0) {
      return undefined
    }

    return { identifier, imageIds }
  },

  /**
   * Retrieves the docker client and server version.
   */
  getDockerVersion: pMemoize(async (cliPath = "docker"): Promise<DockerVersion> => {
    const results = await Promise.all(
      ["client", "server"].map(async (key) => {
        let res: SpawnOutput

        try {
          res = await spawn(cliPath, ["version", "-f", `{{ .${titleize(key)}.Version }}`])
        } catch (err) {
          return [key, undefined]
        }

        const output = res.stdout.trim()

        if (!output) {
          throw new RuntimeError({
            message: `Unexpected docker version output: ${res.all.trim()}`,
          })
        }

        return [key, output]
      })
    )

    return fromPairs(results)
  }),

  /**
   * Asserts that the specified docker server version meets the minimum requirements.
   */
  checkDockerServerVersion(version: DockerVersion, log: ActionLog) {
    if (!version.server) {
      throw new RuntimeError({
        message: `Failed to check Docker server version: Docker server is not running or cannot be reached.`,
      })
    } else {
      let hasMinVersion = true
      try {
        hasMinVersion = checkMinDockerVersion(version.server, minDockerVersion.server)
      } catch (err) {
        log.warn(
          `Failed to parse Docker server version: ${version.server}. Please check your Docker installation. A docker factory reset may be required.`
        )
        return
      }
      if (!hasMinVersion) {
        throw new RuntimeError({
          message: `Docker server needs to be version ${minDockerVersion.server} or newer (got ${version.server})`,
        })
      }
    }
  },

  async dockerCli({
    cwd,
    args,
    log,
    ctx,
    ignoreError = false,
    stdout,
    stderr,
    timeout,
    env,
  }: {
    cwd: string
    args: string[]
    log: Log
    ctx: PluginContext<ContainerProviderConfig>
    ignoreError?: boolean
    stdout?: Writable
    stderr?: Writable
    timeout?: number
    env?: Record<string, MaybeSecret | undefined>
  }) {
    const docker = ctx.tools["container.docker"]

    try {
      const res = await docker.spawnAndWait({
        args,
        cwd,
        env,
        ignoreError,
        log,
        stdout,
        stderr,
        timeoutSec: timeout,
      })
      return res
    } catch (err) {
      if (!(err instanceof GardenError)) {
        throw err
      }
      throw new RuntimeError({
        message: `Unable to run docker command "${args.join(" ")}" in ${cwd}: ${err.message}`,
        wrappedErrors: [err],
      })
    }
  },

  async regctlCli({
    cwd,
    args,
    log,
    ctx,
    ignoreError = false,
    stdout,
    stderr,
    timeout,
  }: {
    cwd: string
    args: string[]
    log: Log
    ctx: PluginContext<ContainerProviderConfig>
    ignoreError?: boolean
    stdout?: Writable
    stderr?: Writable
    timeout?: number
  }) {
    const regctl = ctx.tools["container.regctl"]

    try {
      const res = await regctl.spawnAndWait({
        args,
        cwd,
        ignoreError,
        log,
        stdout,
        stderr,
        timeoutSec: timeout,
      })
      return res
    } catch (err) {
      if (!(err instanceof GardenError)) {
        throw err
      }
      throw new RuntimeError({
        message: `Unable to run regctl command "${args.join(" ")}" in ${cwd}: ${err.message}`,
        wrappedErrors: [err],
      })
    }
  },

  moduleHasDockerfile(config: ContainerModuleConfig, version: ModuleVersion): boolean {
    // If we explicitly set a Dockerfile, we take that to mean you want it to be built.
    // If the file turns out to be missing, this will come up in the build handler.

    const dockerfile = config.spec.dockerfile
    if (!!dockerfile) {
      return true
    }

    // NOTE: The fact that we overloaded the `image` field of a container module means the Dockerfile must be checked into version control
    // This means it's not possible to use `copyFrom` or `generateFiles` to get it from dependencies or generate it at runtime.
    // That's because the `image` field has the following two meanings:
    // 1. Build an image with this name, if a Dockerfile exists
    // 2. Deploy this image from the registry, if no Dockerfile exists
    // This means we need to know if the Dockerfile exists before we know whether the Dockerfile will be present at runtime.
    const dockerfilePath = getDockerfilePath(config.path, dockerfile)
    return version.files.includes(dockerfilePath)
  },

  async actionHasDockerfile(action: Resolved<ContainerBuildAction>): Promise<boolean> {
    const dockerfile = action.getSpec("dockerfile")
    // NOTE: it's important to check for the files existence in the build path to allow dynamically copying the Dockerfile from other actions using `copyFrom`.
    const dockerfileSourcePath = getDockerfilePath(action.getBuildPath(), dockerfile)
    return await pathExists(dockerfileSourcePath)
  },

  /**
   * Parses the Dockerfile in the module (if any) and returns a list of include patterns to apply to the module.
   * Returns undefined if the whole module directory should be included, or if the Dockerfile cannot be parsed.
   * Returns an empty list if there is no Dockerfile, and an `image` is set.
   */
  async autoResolveIncludes(config: ContainerModuleConfig, log: Log) {
    const dockerfilePath = getDockerfilePath(config.path, config.spec.dockerfile)

    if (!(await pathExists(dockerfilePath))) {
      // No Dockerfile, nothing to build, return empty list
      return []
    }

    const dockerfile = await readFile(dockerfilePath)
    let commands: CommandEntry[] = []

    try {
      commands = parse(dockerfile.toString()).filter(
        (cmd) => (cmd.name === "ADD" || cmd.name === "COPY") && cmd.args && Number(cmd.args.length) > 0
      )
    } catch (err) {
      log.warn(`Unable to parse Dockerfile ${dockerfilePath}: ${err}`)
      return undefined
    }

    const paths: string[] = uniq(
      flatten(
        commands.map((cmd) => {
          const parsed = reduce(
            cmd.args as string[],
            (state, current) => {
              // starts with -- and we did not parse any files yet?
              // must be a flag!
              if (current.startsWith("--") && !state.files.length) {
                state.flags.push(current)
              } else {
                // must be a file
                state.files.push(current)
              }

              return state
            },
            { flags: [] as string[], files: [] as string[] }
          )

          if (parsed.flags.find((f) => f.startsWith("--from"))) {
            // Skip statements copying from another build stage
            return []
          }

          // skip the COPY destination
          return parsed.files.slice(0, -1)
        })
      )
        // Strip quotes from quoted paths
        .map(stripQuotes)
        // Ignore URLs
        .filter((path) => !isUrl(path))
    )

    for (const path of paths) {
      if (path === ".") {
        // If any path is "." we need the full build context
        return undefined
      } else if (path.match(/(?<!\\)(?:\\\\)*\$[{\w]/)) {
        // If the path contains a template string we can't currently reason about it
        // TODO: interpolate args into paths
        log.warn(deline`
          Resolving include paths from Dockerfile ARG and ENV variables is not supported yet. Please specify
          required path in Dockerfile explicitly or use ${styles.bold("include")} for path assigned to ARG or ENV.
        `)
        return undefined
      }
    }

    // Make sure to include the Dockerfile
    paths.push(config.spec.dockerfile || defaultDockerfileName)

    return Promise.all(
      paths.map(async (path) => {
        const absPath = join(config.path, path)

        // Unescape escaped template strings
        path = path.replace(/\\\$/g, "$")

        if (isGlob(path, { strict: false })) {
          // Pass globs through directly
          return path
        } else if (await pathExists(absPath)) {
          const stat = await lstat(absPath)

          if (stat.isDirectory()) {
            // If it's a directory, we want to match everything in the directory
            return posix.join(path, "**", "*")
          } else {
            // If it's a file, pass it through as-is
            return path
          }
        } else {
          // Pass the file through directly if it can't be found (an error will occur in the build later)
          return path
        }
      })
    )
  },
}

export const containerHelpers = helpers

function checkMinDockerVersion(version: string, minVersion: string) {
  return semver.gte(fixDockerVersionString(version), fixDockerVersionString(minVersion))
}

// Ugh, Docker doesn't use valid semver. Here's a hacky fix.
function fixDockerVersionString(v: string) {
  return semver.coerce(v.replace(/\.0([\d]+)/g, ".$1"))!
}

function getDockerfilePath(basePath: string, dockerfile = defaultDockerfileName) {
  return joinWithPosix(basePath, dockerfile)
}
