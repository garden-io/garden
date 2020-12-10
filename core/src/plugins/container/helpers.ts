/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, posix } from "path"
import { readFile, pathExists, lstat } from "fs-extra"
import semver from "semver"
import { parse, CommandEntry } from "docker-file-parser"
import isGlob from "is-glob"
import { ConfigurationError, RuntimeError } from "../../exceptions"
import { splitFirst, spawn, splitLast, SpawnOutput } from "../../util/util"
import { ModuleConfig } from "../../config/module"
import {
  ContainerModule,
  ContainerRegistryConfig,
  defaultTag,
  defaultImageNamespace,
  ContainerModuleConfig,
} from "./config"
import { Writable } from "stream"
import Bluebird from "bluebird"
import { flatten, uniq, fromPairs } from "lodash"
import { LogEntry } from "../../logger/log-entry"
import chalk from "chalk"
import isUrl from "is-url"
import titleize from "titleize"
import { deline, stripQuotes } from "../../util/string"
import { PluginContext } from "../../plugin-context"
import { ModuleVersion } from "../../vcs/vcs"

interface DockerVersion {
  client?: string
  server?: string
}

export const DEFAULT_BUILD_TIMEOUT = 600

export const minDockerVersion: DockerVersion = {
  client: "19.03.0",
  server: "17.07.0",
}

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
  getLocalImageId(config: ContainerModuleConfig, version: ModuleVersion): string {
    const hasDockerfile = helpers.hasDockerfile(config, version)

    if (config.spec.image && !hasDockerfile) {
      return config.spec.image
    } else {
      const { versionString } = version
      const name = helpers.getLocalImageName(config)
      const parsedImage = helpers.parseImageId(name)
      return helpers.unparseImageId({ ...parsedImage, tag: versionString })
    }
  },

  /**
   * Returns the image name used locally (without tag/version), when building and deploying to local environments
   * (when we don't need to push to remote registries).
   */
  getLocalImageName(config: ContainerModuleConfig): string {
    if (config.spec.image) {
      const parsedImage = helpers.parseImageId(config.spec.image)
      return helpers.unparseImageId({ ...parsedImage, tag: undefined })
    } else {
      return config.name
    }
  },

  /**
   * Returns the image ID to be used for publishing to container registries
   * (not to be confused with the ID used when pushing to private deployment registries).
   */
  getPublicImageId(module: ContainerModule) {
    // TODO: allow setting a default user/org prefix in the project/plugin config
    const image = module.spec.image

    if (image) {
      let [imageName, version] = splitFirst(image, ":")

      if (version) {
        // we use the version in the image name, if specified
        // (allows specifying version on source images, and also setting specific version name when publishing images)
        return image
      } else {
        const { versionString } = module.version
        return `${imageName}:${versionString}`
      }
    } else {
      return module.outputs["local-image-id"]
    }
  },

  /**
   * Returns the image name (sans tag/version) to be used when pushing to deployment registries.
   */
  getDeploymentImageName(moduleConfig: ContainerModuleConfig, registryConfig?: ContainerRegistryConfig) {
    const localName = moduleConfig.spec.image || moduleConfig.name
    const parsedId = helpers.parseImageId(localName)
    const withoutVersion = helpers.unparseImageId({
      ...parsedId,
      tag: undefined,
    })

    if (!registryConfig) {
      return withoutVersion
    }

    const host = registryConfig.port ? `${registryConfig.hostname}:${registryConfig.port}` : registryConfig.hostname

    return helpers.unparseImageId({
      host,
      namespace: registryConfig.namespace,
      repository: parsedId.repository,
      tag: undefined,
    })
  },

  /**
   * Returns the image ID to be used when pushing to deployment registries. This always has the module version
   * set as the tag.
   */
  getDeploymentImageId(
    moduleConfig: ContainerModuleConfig,
    version: ModuleVersion,
    // Requiring this parameter to avoid accidentally missing it
    registryConfig: ContainerRegistryConfig | undefined
  ): string {
    if (helpers.hasDockerfile(moduleConfig, version)) {
      // If building, return the deployment image name, with the current module version.
      const imageName = helpers.getDeploymentImageName(moduleConfig, registryConfig)

      return helpers.unparseImageId({
        repository: imageName,
        tag: version.versionString,
      })
    } else if (moduleConfig.spec.image) {
      // Otherwise, return the configured image ID.
      return moduleConfig.spec.image
    } else {
      throw new ConfigurationError(`Module ${moduleConfig.name} neither specifies image nor provides Dockerfile`, {
        spec: moduleConfig.spec,
      })
    }
  },

  parseImageId(imageId: string): ParsedImageId {
    let [name, tag] = splitLast(imageId, ":")

    if (name === "") {
      name = tag
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
      throw new ConfigurationError(`Invalid container image tag: ${imageId}`, {
        imageId,
      })
    }
  },

  unparseImageId(parsed: ParsedImageId) {
    const name = parsed.tag ? `${parsed.repository}:${parsed.tag}` : parsed.repository

    if (parsed.host) {
      return `${parsed.host}/${parsed.namespace || defaultImageNamespace}/${name}`
    } else if (parsed.namespace) {
      return `${parsed.namespace}/${name}`
    } else {
      return name
    }
  },

  async pullImage(module: ContainerModule, log: LogEntry, ctx: PluginContext) {
    const identifier = helpers.getPublicImageId(module)
    await helpers.dockerCli({ cwd: module.buildPath, args: ["pull", identifier], log, ctx })
  },

  async imageExistsLocally(module: ContainerModule, log: LogEntry, ctx: PluginContext) {
    const identifier = module.outputs["local-image-id"]
    const result = await helpers.dockerCli({
      cwd: module.path,
      args: ["images", identifier, "-q"],
      log,
      ctx,
    })
    const exists = result.stdout!.length > 0
    return exists ? identifier : null
  },

  /**
   * Retrieves the docker client and server version.
   */
  async getDockerVersion(cliPath = "docker"): Promise<DockerVersion> {
    const results = await Bluebird.map(["client", "server"], async (key) => {
      let res: SpawnOutput

      try {
        res = await spawn(cliPath, ["version", "-f", `{{ .${titleize(key)}.Version }}`])
      } catch (err) {
        return [key, undefined]
      }

      const output = res.stdout.trim()

      if (!output) {
        throw new RuntimeError(`Unexpected docker version output: ${res.all.trim()}`, {
          output,
        })
      }

      return [key, output]
    })

    return fromPairs(results)
  },

  /**
   * Asserts that the specified docker client version meets the minimum requirements.
   */
  checkDockerServerVersion(version: DockerVersion) {
    if (!version.server) {
      throw new RuntimeError(`Docker server is not running or cannot be reached.`, version)
    } else if (!checkMinDockerVersion(version.server, minDockerVersion.server!)) {
      throw new RuntimeError(
        `Docker server needs to be version ${minDockerVersion.server} or newer (got ${version.server})`,
        {
          ...version,
        }
      )
    }
  },

  async dockerCli({
    cwd,
    args,
    log,
    ctx,
    ignoreError = false,
    outputStream,
    timeout,
  }: {
    cwd: string
    args: string[]
    log: LogEntry
    ctx: PluginContext
    ignoreError?: boolean
    outputStream?: Writable
    timeout?: number
  }) {
    const docker = ctx.tools["container.docker"]

    try {
      const res = await docker.spawnAndWait({
        args,
        cwd,
        env: { ...process.env, DOCKER_CLI_EXPERIMENTAL: "enabled" },
        ignoreError,
        log,
        stdout: outputStream,
        timeoutSec: timeout,
      })
      return res
    } catch (err) {
      throw new RuntimeError(`Unable to run docker command: ${err.message}`, {
        err,
        args,
        cwd,
      })
    }
  },

  hasDockerfile(config: ContainerModuleConfig, version: ModuleVersion): boolean {
    // If we explicitly set a Dockerfile, we take that to mean you want it to be built.
    // If the file turns out to be missing, this will come up in the build handler.
    const dockerfileSourcePath = helpers.getDockerfileSourcePath(config)
    return !!config.spec.dockerfile || version.files.includes(dockerfileSourcePath)
  },

  getDockerfileBuildPath(module: ContainerModule) {
    return getDockerfilePath(module.buildPath, module.spec.dockerfile)
  },

  getDockerfileSourcePath(config: ModuleConfig) {
    return getDockerfilePath(config.path, config.spec.dockerfile)
  },

  /**
   * Parses the Dockerfile in the module (if any) and returns a list of include patterns to apply to the module.
   * Returns undefined if the whole module directory should be included, or if the Dockerfile cannot be parsed.
   * Returns an empty list if there is no Dockerfile, and an `image` is set.
   */
  async autoResolveIncludes(config: ContainerModuleConfig, log: LogEntry) {
    const dockerfilePath = helpers.getDockerfileSourcePath(config)

    if (!(await pathExists(dockerfilePath))) {
      // No Dockerfile, nothing to build, return empty list
      return []
    }

    const dockerfile = await readFile(dockerfilePath)
    let commands: CommandEntry[] = []

    try {
      commands = parse(dockerfile.toString()).filter(
        (cmd) => (cmd.name === "ADD" || cmd.name === "COPY") && cmd.args && cmd.args.length > 0
      )
    } catch (err) {
      log.warn(chalk.yellow(`Unable to parse Dockerfile ${dockerfilePath}: ${err.message}`))
      return undefined
    }

    const paths: string[] = uniq(
      flatten(
        commands.map((cmd) => {
          const args = cmd.args as string[]
          if (args[0].startsWith("--chown")) {
            // Ignore --chown args
            return args.slice(1, -1)
          } else if (args[0].startsWith("--from")) {
            // Skip statements copying from another build stage
            return []
          } else {
            return args.slice(0, -1)
          }
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
        log.warn(
          chalk.yellow(deline`
          Resolving include paths from Dockerfile ARG and ENV variables is not supported yet. Please specify
          required path in Dockerfile explicitly or use ${chalk.bold("include")} for path assigned to ARG or ENV.
          `)
        )
        return undefined
      }
    }

    // Make sure to include the Dockerfile
    paths.push(config.spec.dockerfile || "Dockerfile")

    return Bluebird.map(paths, async (path) => {
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

function getDockerfilePath(basePath: string, dockerfile = "Dockerfile") {
  return join(basePath, dockerfile)
}
