/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createSchema, joi, joiIdentifier } from "../config/common.js"
import { deline } from "../util/string.js"
import type { Architecture, Platform } from "../util/arch-platform.js"

export interface ToolBuildSpec {
  platform: Platform
  architecture: Architecture
  url: string
  sha256: string
  extract?: {
    format: string
    targetPath: string
  }
}

const toolBuildSchema = createSchema({
  name: "plugin-tool-build",
  keys: () => ({
    platform: joi
      .string()
      .allow("darwin", "linux", "alpine", "windows")
      .required()
      .example("linux")
      .description("The platform this build is for."),
    architecture: joi
      .string()
      .allow("amd64", "arm64")
      .required()
      .example("amd64")
      .description("The architecture of the build."),
    url: joi
      .string()
      .uri({ allowRelative: false })
      .required()
      .example("https://github.com/some/tool/releases/download/my-tool-linux-amd64.tar.gz")
      .description("The URL to download for the build."),
    sha256: joi
      .string()
      .required()
      .example("a81b23abe67e70f8395ff7a3659bea6610fba98cda1126ef19e0a995f0075d54")
      .description("The SHA256 sum the target file should have."),
    extract: joi
      .object()
      .keys({
        format: joi.string().allow("tar", "zip").required().example("tar").description("The archive format."),
        targetPath: joi
          .posixPath()
          .relativeOnly()
          .example("my-tool/binary.exe")
          .description("The path to the binary within the archive, if applicable."),
      })
      .description("Specify instructions for extraction, if the URL points to an archive."),
  }),
})

export interface PluginToolSpec {
  name: string
  version: string
  description: string
  type: "library" | "binary"
  builds: ToolBuildSpec[]
  _includeInGardenImage?: boolean
}

export const toolSchema = createSchema({
  name: "plugin-tool",
  keys: () => ({
    name: joiIdentifier().description("The name of the tool. This must be unique within the provider."),
    version: joi.string().description("Version of the tool").example("1.2.3"),
    description: joi.string().required().description("A short description of the tool, used for help texts."),
    type: joi
      .string()
      .allow("library", "binary")
      .description(
        `Set this to "library" if the tool is not an executable. Set to "binary" if it should be exposed as a command.`
      ),
    builds: joi.array().items(toolBuildSchema()).required().description(deline`
        List of platform and architecture builds, with URLs and (if applicable) archive extraction information.
        The list should include at least an amd64 build for each of darwin, linux and windows.
      `),
    _includeInGardenImage: joi
      .boolean()
      .description("Set to true if this tool should be pre-fetched during Garden container image builds.")
      .meta({ internal: true }),
  }),
})
