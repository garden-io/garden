/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import semver from "semver"
import { ConfigurationError, RuntimeError } from "../../exceptions"
import { splitFirst, spawn, splitLast } from "../../util/util"
import { ModuleConfig } from "../../config/module"
import { ContainerModule, ContainerRegistryConfig, defaultTag, defaultNamespace, ContainerModuleConfig } from "./config"
import { Writable } from "stream"

export const DEFAULT_BUILD_TIMEOUT = 600
export const minDockerVersion = "17.07.0"

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
  async getLocalImageId(module: ContainerModule): Promise<string> {
    const hasDockerfile = await helpers.hasDockerfile(module)

    if (module.spec.image && !hasDockerfile) {
      return module.spec.image
    } else {
      const { versionString } = module.version
      const name = await helpers.getLocalImageName(module)
      const parsedImage = helpers.parseImageId(name)
      return helpers.unparseImageId({ ...parsedImage, tag: versionString })
    }
  },

  /**
   * Returns the image name used locally (without tag/version), when building and deploying to local environments
   * (when we don't need to push to remote registries).
   */
  async getLocalImageName(config: ContainerModuleConfig): Promise<string> {
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
  async getPublicImageId(module: ContainerModule) {
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
      return helpers.getLocalImageId(module)
    }
  },

  /**
   * Returns the image name (sans tag/version) to be used when pushing to deployment registries.
   */
  async getDeploymentImageName(moduleConfig: ContainerModuleConfig, registryConfig?: ContainerRegistryConfig) {
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
  // Requiring 2nd parameter to avoid accidentally missing it
  async getDeploymentImageId(module: ContainerModule, registryConfig: ContainerRegistryConfig | undefined) {
    if (await helpers.hasDockerfile(module)) {
      // If building, return the deployment image name, with the current module version.
      const imageName = await helpers.getDeploymentImageName(module, registryConfig)

      return helpers.unparseImageId({
        repository: imageName,
        tag: module.version.versionString,
      })
    } else if (module.spec.image) {
      // Otherwise, return the configured image ID.
      return module.spec.image
    } else {
      throw new ConfigurationError(`Module ${module.name} neither specifies image nor provides Dockerfile`, {
        spec: module.spec,
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
      return `${parsed.host}/${parsed.namespace || defaultNamespace}/${name}`
    } else if (parsed.namespace) {
      return `${parsed.namespace}/${name}`
    } else {
      return name
    }
  },

  async pullImage(module: ContainerModule) {
    const identifier = await helpers.getPublicImageId(module)
    await helpers.dockerCli(module, ["pull", identifier])
  },

  async imageExistsLocally(module: ContainerModule) {
    const identifier = await helpers.getLocalImageId(module)
    const exists = (await helpers.dockerCli(module, ["images", identifier, "-q"])).length > 0
    return exists ? identifier : null
  },

  dockerVersionChecked: false,

  async getDockerVersion() {
    let versionRes

    try {
      versionRes = await spawn("docker", ["version", "-f", "{{ .Client.Version }} {{ .Server.Version }}"])
    } catch (err) {
      throw new RuntimeError(`Unable to get docker version: ${err.message}`, {
        err,
      })
    }

    const output = versionRes.output.trim()
    const split = output.split(" ")

    const clientVersion = split[0]
    const serverVersion = split[1]

    if (!clientVersion || !serverVersion) {
      throw new RuntimeError(`Unexpected docker version output: ${output}`, {
        output,
      })
    }

    return { clientVersion, serverVersion }
  },

  async checkDockerVersion() {
    if (helpers.dockerVersionChecked) {
      return
    }

    const fixedMinVersion = fixDockerVersionString(minDockerVersion)
    const { clientVersion, serverVersion } = await helpers.getDockerVersion()

    if (!semver.gte(fixDockerVersionString(clientVersion), fixedMinVersion)) {
      throw new RuntimeError(`Docker client needs to be version ${minDockerVersion} or newer (got ${clientVersion})`, {
        clientVersion,
        serverVersion,
      })
    }

    if (!semver.gte(fixDockerVersionString(serverVersion), fixedMinVersion)) {
      throw new RuntimeError(`Docker server needs to be version ${minDockerVersion} or newer (got ${serverVersion})`, {
        clientVersion,
        serverVersion,
      })
    }

    helpers.dockerVersionChecked = true
  },

  async dockerCli(
    module: ContainerModule,
    args: string[],
    { outputStream, timeout = DEFAULT_BUILD_TIMEOUT }: { outputStream?: Writable; timeout?: number } = {}
  ) {
    await helpers.checkDockerVersion()

    const cwd = module.buildPath

    try {
      const res = await spawn("docker", args, { cwd, outputStream, timeout })
      return res.output || ""
    } catch (err) {
      throw new RuntimeError(`Unable to run docker command: ${err.message}`, {
        err,
        args,
        cwd,
      })
    }
  },

  async hasDockerfile(module: ContainerModule): Promise<Boolean> {
    // If we explicitly set a Dockerfile, we take that to mean you want it to be built.
    // If the file turns out to be missing, this will come up in the build handler.
    const dockerfileSourcePath = helpers.getDockerfileSourcePath(module)
    return !!module.spec.dockerfile || module.version.files.includes(dockerfileSourcePath)
  },

  getDockerfileBuildPath(module: ContainerModule) {
    return getDockerfilePath(module.buildPath, module.spec.dockerfile)
  },

  getDockerfileSourcePath(config: ModuleConfig) {
    return getDockerfilePath(config.path, config.spec.dockerfile)
  },
}

export const containerHelpers = helpers

// Ugh, Docker doesn't use valid semver. Here's a hacky fix.
function fixDockerVersionString(v: string) {
  return semver.coerce(v.replace(/\.0([\d]+)/g, ".$1"))!
}

function getDockerfilePath(basePath: string, dockerfile = "Dockerfile") {
  return join(basePath, dockerfile)
}
