/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import which from "which"

import { CliWrapper } from "@garden-io/sdk/build/src/util/ext-tools.js"
import { ConfigurationError, RuntimeError } from "@garden-io/sdk/build/src/exceptions.js"
import type { Log, PluginContext, PluginToolSpec } from "@garden-io/sdk/build/src/types.js"
import type { PulumiProvider } from "./provider.js"
import { naturalList } from "@garden-io/sdk/build/src/util/string.js"
import { SemVer } from "semver"

export const defaultPulumiEnv = {
  // This suppresses the "warning: A new version of Pulumi is available" output when running pulumi commands.
  PULUMI_SKIP_UPDATE_CHECK: "true",
  // TODO: Make user explicitly pick which (or all) env vars to merge in here?
  ...process.env,
}

export function pulumi(ctx: PluginContext, provider: PulumiProvider) {
  const version = provider.config.version

  if (version === null) {
    return new GlobalPulumi()
  } else {
    const cli = ctx.tools["pulumi.pulumi-" + version.replace(/\./g, "-")]

    if (!cli) {
      throw new ConfigurationError({
        message: `Unsupported pulumi version: ${version}. Supported versions: ${naturalList(supportedVersions)}`,
      })
    }

    return cli
  }
}

export class GlobalPulumi extends CliWrapper {
  protected override toolPath = "pulumi"

  constructor() {
    super({ name: "pulumi" })
  }

  override async getPath(_: Log) {
    try {
      return await which("pulumi")
    } catch (err) {
      throw new RuntimeError({
        message: `Pulumi version is set to null, and pulumi CLI could not be found on PATH`,
      })
    }
  }
}

const PULUMI_SEM_VER_3_122_0 = new SemVer("3.122.0")
const PULUMI_VERSION_3_122_0 = PULUMI_SEM_VER_3_122_0.version

const PULUMI_SEM_VER_3_102_0 = new SemVer("3.102.0")
const PULUMI_VERSION_3_102_0 = PULUMI_SEM_VER_3_102_0.version

const PULUMI_SEM_VER_3_70_0 = new SemVer("3.70.0")
const PULUMI_VERSION_3_70_0 = PULUMI_SEM_VER_3_70_0.version

const PULUMI_SEM_VER_3_64_0 = new SemVer("3.64.0")
const PULUMI_VERSION_3_64_0 = PULUMI_SEM_VER_3_64_0.version

function getPulumiToolName(semVer: SemVer) {
  return `pulumi-${semVer.major}-${semVer.minor}-${semVer.patch}`
}

function getPulumiToolDescription(semVer: SemVer) {
  return `The pulumi CLI, v${semVer}`
}

export const pulumiCliSpecs: PluginToolSpec[] = [
  {
    version: PULUMI_VERSION_3_122_0,
    name: getPulumiToolName(PULUMI_SEM_VER_3_122_0),
    description: getPulumiToolDescription(PULUMI_SEM_VER_3_122_0),
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_122_0}/pulumi-v${PULUMI_VERSION_3_122_0}-darwin-x64.tar.gz`,
        sha256: "b06d2e15576a5522e7965c612094efc66b2350e473646138ca6c4dbbf2664cf2",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_122_0}/pulumi-v${PULUMI_VERSION_3_122_0}-darwin-arm64.tar.gz`,
        sha256: "7537061ef6a82a4215d78de90a45d4548a72f01989f5a1636fb57d7d82bce4fa",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_122_0}/pulumi-v${PULUMI_VERSION_3_122_0}-linux-x64.tar.gz`,
        sha256: "19654329473635b3b4a32812e221d2aac737205c27b51d555c3b7b34d7e1e218",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_122_0}/pulumi-v${PULUMI_VERSION_3_122_0}-linux-arm64.tar.gz`,
        sha256: "b5bc4c80b8da257251358344c6b88a2d87533bab262958b136268602835e631d",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_122_0}/pulumi-v${PULUMI_VERSION_3_122_0}-windows-x64.zip`,
        sha256: "bed142db4ec4ff99faad2b88c2c59afc13deb2d1cf8a9e4ae070541bdfee31b2",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  {
    version: PULUMI_VERSION_3_102_0,
    name: getPulumiToolName(PULUMI_SEM_VER_3_102_0),
    description: getPulumiToolDescription(PULUMI_SEM_VER_3_102_0),
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_102_0}/pulumi-v${PULUMI_VERSION_3_102_0}-darwin-x64.tar.gz`,
        sha256: "84dbb8d43dab7197bc074a3ff7cb1dfb0b2a65960d5726199d68557491d347ff",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_102_0}/pulumi-v${PULUMI_VERSION_3_102_0}-darwin-arm64.tar.gz`,
        sha256: "988e45d1f48ce521cbb8134583bc5d0c3b9bab7aa9a6b99c60316293fbce18de",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_102_0}/pulumi-v${PULUMI_VERSION_3_102_0}-linux-x64.tar.gz`,
        sha256: "b19b562b1d6ca2688bb1f83a037dc62d5283acd1ab1690878fd4d55a34beedb0",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_102_0}/pulumi-v${PULUMI_VERSION_3_102_0}-linux-arm64.tar.gz`,
        sha256: "59743eb222d13741f43c774fc1b089416f7457265e05416038e663225e0cb7c9",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_102_0}/pulumi-v${PULUMI_VERSION_3_102_0}-windows-x64.zip`,
        sha256: "2cf2ab3f85faeda8c3e69844ec8e395de304db2d72a8c850e7beed336fed46cf",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  {
    version: PULUMI_VERSION_3_70_0,
    name: getPulumiToolName(PULUMI_SEM_VER_3_70_0),
    description: getPulumiToolDescription(PULUMI_SEM_VER_3_70_0),
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_70_0}/pulumi-v${PULUMI_VERSION_3_70_0}-darwin-x64.tar.gz`,
        sha256: "03833c283e24e395a1946c2412a46cb21dbbe72d595a992deebc2aa01a2c8513",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_70_0}/pulumi-v${PULUMI_VERSION_3_70_0}-darwin-arm64.tar.gz`,
        sha256: "3e0f3471d7b9184fa0cb87b0716f7b2470a6d25318433bf7f9019442d35fe7f4",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_70_0}/pulumi-v${PULUMI_VERSION_3_70_0}-linux-x64.tar.gz`,
        sha256: "3585a5d2ae64ba7869e287ed2ac14e86a7c99732cc0e74bf1c0ebb6982af2251",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_70_0}/pulumi-v${PULUMI_VERSION_3_70_0}-linux-arm64.tar.gz`,
        sha256: "042849d0aaa16b46f5e8ad062e684219ec803f9b56e8719c04f2469f63b530f4",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_70_0}/pulumi-v${PULUMI_VERSION_3_70_0}-windows-x64.zip`,
        sha256: "bd31daf17fb3066907d67b479c11910461bea046fa9018df8765753f3ddd570b",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  {
    version: PULUMI_VERSION_3_64_0,
    name: getPulumiToolName(PULUMI_SEM_VER_3_64_0),
    description: getPulumiToolDescription(PULUMI_SEM_VER_3_64_0),
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_64_0}/pulumi-v${PULUMI_VERSION_3_64_0}-darwin-x64.tar.gz`,
        sha256: "ee62df4a40ab7cb016491f529e0256761a8ced6962dea28f88409d692cafcc82",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_64_0}/pulumi-v${PULUMI_VERSION_3_64_0}-darwin-arm64.tar.gz`,
        sha256: "a531dc361dd016a72c22476d2981f71cc9892d210d11c19b4e1fcc8d6c629d1a",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_64_0}/pulumi-v${PULUMI_VERSION_3_64_0}-linux-x64.tar.gz`,
        sha256: "2560cce127c838c8367541e9493ec12ae9a3144884f98c2afb99b01a14b6b0f7",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_64_0}/pulumi-v${PULUMI_VERSION_3_64_0}-linux-arm64.tar.gz`,
        sha256: "aee09cb70fcffba8c70878fff196d655d76cb7bf56623bb89b0e06efc2e58e79",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://github.com/pulumi/pulumi/releases/download/v${PULUMI_VERSION_3_64_0}/pulumi-v${PULUMI_VERSION_3_64_0}-windows-x64.zip`,
        sha256: "b0424ad34a2abbd196f78b62cac9a72bafe080c84c6068bede3a4e31e48a0a48",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
]

export const supportedVersions = pulumiCliSpecs.map((s) => s.version)

// Default to latest pulumi version
export const defaultPulumiVersion = PULUMI_VERSION_3_122_0
