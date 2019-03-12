/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pathExists } from "fs-extra"
import { join } from "path"
import { ConfigurationError } from "../../exceptions"
import { splitFirst, spawn } from "../../util/util"
import { ModuleConfig } from "../../config/module"
import { ContainerModule, ContainerRegistryConfig, defaultTag, defaultNamespace } from "./config"

interface ParsedImageId {
  host?: string
  namespace?: string
  repository: string
  tag: string
}

function getDockerfilePath(basePath: string, dockerfile?: string) {
  if (dockerfile) {
    return join(basePath, dockerfile)
  }
  return join(basePath, "Dockerfile")
}

// TODO: This is done to make it easy to stub when testing.
// We should come up with a better way than exporting this object.
export const containerHelpers = {
  /**
   * Returns the image ID used locally, when building and deploying to local environments
   * (when we don't need to push to remote registries).
   */
  async getLocalImageId(module: ContainerModule): Promise<string> {
    const hasDockerfile = await containerHelpers.hasDockerfile(module)

    if (module.spec.image && hasDockerfile) {
      const { versionString } = module.version
      const parsedImage = containerHelpers.parseImageId(module.spec.image)
      return containerHelpers.unparseImageId({ ...parsedImage, tag: versionString })
    } else if (!module.spec.image && hasDockerfile) {
      const { versionString } = module.version
      return containerHelpers.unparseImageId({ repository: module.name, tag: versionString })
    } else if (module.spec.image && !hasDockerfile) {
      return module.spec.image
    } else {
      const { versionString } = module.version
      const parsedImage = containerHelpers.parseImageId(module.name)
      return containerHelpers.unparseImageId({ ...parsedImage, tag: versionString })
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
      return containerHelpers.getLocalImageId(module)
    }
  },

  /**
   * Returns the image ID to be used when pushing to deployment registries.
   */
  async getDeploymentImageId(module: ContainerModule, registryConfig?: ContainerRegistryConfig) {
    const localId = await containerHelpers.getLocalImageId(module)

    if (!registryConfig) {
      return localId
    }

    const parsedId = containerHelpers.parseImageId(localId)

    const host = registryConfig.port ? `${registryConfig.hostname}:${registryConfig.port}` : registryConfig.hostname

    return containerHelpers.unparseImageId({
      host,
      namespace: registryConfig.namespace,
      repository: parsedId.repository,
      tag: parsedId.tag,
    })
  },

  parseImageId(imageId: string): ParsedImageId {
    let [name, tag] = imageId.split(":")
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
      throw new ConfigurationError(`Invalid container image tag: ${imageId}`, { imageId })
    }
  },

  unparseImageId(parsed: ParsedImageId) {
    const name = `${parsed.repository}:${parsed.tag}`

    if (parsed.host) {
      return `${parsed.host}/${parsed.namespace || defaultNamespace}/${name}`
    } else if (parsed.namespace) {
      return `${parsed.namespace}/${name}`
    } else {
      return name
    }
  },

  async pullImage(module: ContainerModule) {
    const identifier = await containerHelpers.getPublicImageId(module)
    await containerHelpers.dockerCli(module, ["pull", identifier])
  },

  async imageExistsLocally(module: ContainerModule) {
    const identifier = await containerHelpers.getLocalImageId(module)
    const exists = (await containerHelpers.dockerCli(module, ["images", identifier, "-q"])).length > 0
    return exists ? identifier : null
  },

  async dockerCli(module: ContainerModule, args: string[]) {
    // TODO: use dockerode instead of CLI
    const output = await spawn("docker", args, { cwd: module.buildPath })
    return output.output || ""
  },

  async hasDockerfile(module: ContainerModule) {
    return pathExists(containerHelpers.getDockerfilePathFromModule(module))
  },

  getDockerfilePathFromModule(module: ContainerModule) {
    return getDockerfilePath(module.buildPath, module.spec.dockerfile)
  },

  getDockerfilePathFromConfig(config: ModuleConfig) {
    return getDockerfilePath(config.path, config.spec.dockerfile)
  },

}
