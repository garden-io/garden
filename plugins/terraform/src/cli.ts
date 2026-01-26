/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TerraformProvider } from "./provider.js"
import { ConfigurationError } from "@garden-io/sdk/build/src/exceptions.js"
import type { PluginToolSpec } from "@garden-io/sdk/build/src/util/ext-tools.js"
import { CliWrapperFromPath, GlobalCliWrapper } from "@garden-io/sdk/build/src/util/ext-tools.js"
import type { PluginContext } from "@garden-io/sdk/build/src/types.js"
import { naturalList } from "@garden-io/sdk/build/src/util/string.js"
import { SemVer } from "semver"
import { isAbsolute } from "path"

export function terraform(ctx: PluginContext, provider: TerraformProvider) {
  const version = provider.config.version

  if (version === null) {
    return new GlobalCliWrapper({ name: "terraform" })
  }
  if (isAbsolute(version)) {
    // Then the user provided an absolute path to the Terraform binary which they want to use.
    return new CliWrapperFromPath({ name: "terraform", pathToBinary: version })
  }
  const cli = ctx.tools["terraform.terraform-" + version.replace(/\./g, "-")]

  if (!cli) {
    throw new ConfigurationError({
      message: `Unsupported Terraform version: ${version}. Supported versions: ${naturalList(supportedVersions)}`,
    })
  }

  return cli
}

const TERRAFORM_SEM_VER_0_12_26 = new SemVer("0.12.26")
const TERRAFORM_VERSION_0_12_26 = TERRAFORM_SEM_VER_0_12_26.version

const TERRAFORM_SEM_VER_0_13_3 = new SemVer("0.13.3")
const TERRAFORM_VERSION_0_13_3 = TERRAFORM_SEM_VER_0_13_3.version

const TERRAFORM_SEM_VER_0_14_7 = new SemVer("0.14.7")
const TERRAFORM_VERSION_0_14_7 = TERRAFORM_SEM_VER_0_14_7.version

const TERRAFORM_SEM_VER_1_0_5 = new SemVer("1.0.5")
const TERRAFORM_VERSION_1_0_5 = TERRAFORM_SEM_VER_1_0_5.version

const TERRAFORM_SEM_VER_1_2_9 = new SemVer("1.2.9")
const TERRAFORM_VERSION_1_2_9 = TERRAFORM_SEM_VER_1_2_9.version

const TERRAFORM_SEM_VER_1_4_6 = new SemVer("1.4.6")
const TERRAFORM_VERSION_1_4_6 = TERRAFORM_SEM_VER_1_4_6.version

function getTerraformToolName(semVer: SemVer) {
  return `terraform-${semVer.major}-${semVer.minor}-${semVer.patch}`
}

function getTerraformToolDescription(semVer: SemVer) {
  return `The terraform CLI, v${semVer}`
}

export const terraformCliSpecs: PluginToolSpec[] = [
  {
    name: getTerraformToolName(TERRAFORM_SEM_VER_0_12_26),
    version: TERRAFORM_VERSION_0_12_26,
    description: getTerraformToolDescription(TERRAFORM_SEM_VER_0_12_26),
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_12_26}/terraform_${TERRAFORM_VERSION_0_12_26}_darwin_amd64.zip`,
        sha256: "5dd8deea9060d2d90b748425cde9063620131f02922a993e3d925048375d9b29",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_12_26}/terraform_${TERRAFORM_VERSION_0_12_26}_linux_amd64.zip`,
        sha256: "607bc802b1c6c2a5e62cc48640f38aaa64bef1501b46f0ae4829feb51594b257",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_12_26}/terraform_${TERRAFORM_VERSION_0_12_26}_windows_amd64.zip`,
        sha256: "f232bf25dc32e618fbb692b98857d10a84e16e531e9ce5e87e060c1369bde092",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  {
    name: getTerraformToolName(TERRAFORM_SEM_VER_0_13_3),
    version: TERRAFORM_VERSION_0_13_3,
    description: getTerraformToolDescription(TERRAFORM_SEM_VER_0_13_3),
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_13_3}/terraform_${TERRAFORM_VERSION_0_13_3}_darwin_amd64.zip`,
        sha256: "4a613dc18ff8cfac525a59cc0e78216fa0a9ecd63e6ac45603561ceb72f6d772",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_13_3}/terraform_${TERRAFORM_VERSION_0_13_3}_linux_amd64.zip`,
        sha256: "35c662be9d32d38815cde5fa4c9fa61a3b7f39952ecd50ebf92fd1b2ddd6109b",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_13_3}/terraform_${TERRAFORM_VERSION_0_13_3}_windows_amd64.zip`,
        sha256: "e4aba639b2fb946c5c17b982c22c8ff3a7a3c07725978284ffc1cc651961da2c",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  {
    name: getTerraformToolName(TERRAFORM_SEM_VER_0_14_7),
    version: TERRAFORM_VERSION_0_14_7,
    description: getTerraformToolDescription(TERRAFORM_SEM_VER_0_14_7),
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_14_7}/terraform_${TERRAFORM_VERSION_0_14_7}_darwin_amd64.zip`,
        sha256: "bd4afbb92cfc99f3f7e81412536e1aa9bafd6544a87454286d9e9f6ab446179a",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_14_7}/terraform_${TERRAFORM_VERSION_0_14_7}_linux_amd64.zip`,
        sha256: "6b66e1faf0ad4ece28c42a1877e95bbb1355396231d161d78b8ca8a99accc2d7",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_14_7}/terraform_${TERRAFORM_VERSION_0_14_7}_linux_arm64.zip`,
        sha256: "0a621f1dc411953b955aaf2d7d46b2f350bd3a85a2284ec994ae41419844120b",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_0_14_7}/terraform_${TERRAFORM_VERSION_0_14_7}_windows_amd64.zip`,
        sha256: "1cc49c7522d3a6a583ad627aea2d2b4fb182312f4f97d70d445e2345e4a4f4d4",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  {
    name: getTerraformToolName(TERRAFORM_SEM_VER_1_0_5),
    version: TERRAFORM_VERSION_1_0_5,
    description: getTerraformToolDescription(TERRAFORM_SEM_VER_1_0_5),
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_0_5}/terraform_${TERRAFORM_VERSION_1_0_5}_darwin_amd64.zip`,
        sha256: "51b481f2cc02651c14854f57dc0c43c3918b19b6fc5e687295b98beee5d20271",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_0_5}/terraform_${TERRAFORM_VERSION_1_0_5}_darwin_arm64.zip`,
        sha256: "8fadd8bbcdcaf6452d9937af6b916572f481caabcc29ea9aac61c7f4759e133e",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_0_5}/terraform_${TERRAFORM_VERSION_1_0_5}_linux_amd64.zip`,
        sha256: "7ce24478859ab7ca0ba4d8c9c12bb345f52e8efdc42fa3ef9dd30033dbf4b561",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_0_5}/terraform_${TERRAFORM_VERSION_1_0_5}_linux_arm64.zip`,
        sha256: "f6c56ebb17d6109d908c2936bbdab74f6f7813c542db85ef6cef3dd020359eb2",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_0_5}/terraform_${TERRAFORM_VERSION_1_0_5}_windows_amd64.zip`,
        sha256: "37de2cd8153286e41b029a719f03b747058cda09576e3297d3d24e1d30e27a12",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  {
    name: getTerraformToolName(TERRAFORM_SEM_VER_1_2_9),
    version: TERRAFORM_VERSION_1_2_9,
    description: getTerraformToolDescription(TERRAFORM_SEM_VER_1_2_9),
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_2_9}/terraform_${TERRAFORM_VERSION_1_2_9}_darwin_amd64.zip`,
        sha256: "84a678ece9929cebc34c7a9a1ba287c8b91820b336f4af8437af7feaa0117b7c",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_2_9}/terraform_${TERRAFORM_VERSION_1_2_9}_darwin_arm64.zip`,
        sha256: "bc3b94b53cdf1be3c4988faa61aad343f48e013928c64bfc6ebeb61657f97baa",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_2_9}/terraform_${TERRAFORM_VERSION_1_2_9}_linux_amd64.zip`,
        sha256: "0e0fc38641addac17103122e1953a9afad764a90e74daf4ff8ceeba4e362f2fb",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_2_9}/terraform_${TERRAFORM_VERSION_1_2_9}_linux_arm64.zip`,
        sha256: "6da7bf01f5a72e61255c2d80eddeba51998e2bb1f50a6d81b0d3b71e70e18531",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_2_9}/terraform_1.2.9_windows_amd64.zip`,
        sha256: "1425bbe982251dde58104dab3d41f48a51d8735122bdb3790b3b3686c57ebfa2",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  {
    name: getTerraformToolName(TERRAFORM_SEM_VER_1_4_6),
    version: TERRAFORM_VERSION_1_4_6,
    description: getTerraformToolDescription(TERRAFORM_SEM_VER_1_4_6),
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_4_6}/terraform_${TERRAFORM_VERSION_1_4_6}_darwin_amd64.zip`,
        sha256: "5d8332994b86411b049391d31ad1a0785dfb470db8b9c50617de28ddb5d1f25d",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_4_6}/terraform_${TERRAFORM_VERSION_1_4_6}_darwin_arm64.zip`,
        sha256: "30a2f87298ff9f299452119bd14afaa8d5b000c572f62fa64baf432e35d9dec1",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_4_6}/terraform_${TERRAFORM_VERSION_1_4_6}_linux_amd64.zip`,
        sha256: "e079db1a8945e39b1f8ba4e513946b3ab9f32bd5a2bdf19b9b186d22c5a3d53b",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_4_6}/terraform_${TERRAFORM_VERSION_1_4_6}_linux_arm64.zip`,
        sha256: "b38f5db944ac4942f11ceea465a91e365b0636febd9998c110fbbe95d61c3b26",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: `https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION_1_4_6}/terraform_${TERRAFORM_VERSION_1_4_6}_windows_amd64.zip`,
        sha256: "f666aa1388f94c9b86ea01cb884ba53b9132d2cec3d9cac976ad93a2aba901d5",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
]

export const supportedVersions = terraformCliSpecs.map((s) => s.version)

// Default to latest Terraform version
export const defaultTerraformVersion = TERRAFORM_VERSION_1_4_6
