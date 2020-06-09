/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigurationError } from "../../exceptions"
import { PluginToolSpec } from "../../types/plugin/tools"
import { TerraformProvider } from "./terraform"

export function terraform(provider: TerraformProvider) {
  const version = provider.config.version
  const cli = provider.tools["terraform-" + version.replace(/\./g, "-")]

  if (!cli) {
    throw new ConfigurationError(`Unsupported Terraform version: ${version}`, {
      version,
      supportedVersions,
    })
  }

  return cli
}

export const terraformCliSpecs: { [version: string]: PluginToolSpec } = {
  "0.11.14": {
    name: "terraform-0-11-14",
    description: "The terraform CLI, v0.11.14",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.11.14/terraform_0.11.14_darwin_amd64.zip",
        sha256: "829bdba148afbd61eab4aafbc6087838f0333d8876624fe2ebc023920cfc2ad5",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.11.14/terraform_0.11.14_linux_amd64.zip",
        sha256: "9b9a4492738c69077b079e595f5b2a9ef1bc4e8fb5596610f69a6f322a8af8dd",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.11.14/terraform_0.11.14_windows_amd64.zip",
        sha256: "bfec66e2ad079a1fab6101c19617a82ef79357dc1b92ddca80901bb8d5312dc0",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "0.12.7": {
    name: "terraform-0-12-7",
    description: "The terraform CLI, v0.12.7",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.7/terraform_0.12.7_darwin_amd64.zip",
        sha256: "5cb59cdc4a8c4ebdfc0b8715936110e707d869c59603d27020e33b2be2e50f21",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.7/terraform_0.12.7_linux_amd64.zip",
        sha256: "a0fa11217325f76bf1b4f53b0f7a6efb1be1826826ef8024f2f45e60187925e7",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.7/terraform_0.12.7_windows_amd64.zip",
        sha256: "ce5b0eae0b443cbbb7c592d1b48bad6c8a3c5298932d35a4ebcba800c3488e4e",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "0.12.21": {
    name: "terraform-0-12-21",
    description: "The terraform CLI, v0.12.21",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.21/terraform_0.12.21_darwin_amd64.zip",
        sha256: "f89b620e59439fccc80950bbcbd37a069101cbef7029029a12227eee831e463f",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.21/terraform_0.12.21_linux_amd64.zip",
        sha256: "ca0d0796c79d14ee73a3d45649dab5e531f0768ee98da71b31e423e3278e9aa9",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.21/terraform_0.12.21_windows_amd64.zip",
        sha256: "254e5f870efe9d86a3f211a1b9c3c01325fc380e428f54542b7750d8bfd62bb1",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "0.12.24": {
    name: "terraform-0-12-24",
    description: "The terraform CLI, v0.12.24",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.24/terraform_0.12.24_darwin_amd64.zip",
        sha256: "72482000a5e25c33e88e95d70208304acfd09bf855a7ede110da032089d13b4f",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.24/terraform_0.12.24_linux_amd64.zip",
        sha256: "602d2529aafdaa0f605c06adb7c72cfb585d8aa19b3f4d8d189b42589e27bf11",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.24/terraform_0.12.24_windows_amd64.zip",
        sha256: "fd1679999d4555639f7074ad0a86d1a627a6da5e52dacdb77d3ecbcd1b5bca0a",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
}

export const supportedVersions = Object.keys(terraformCliSpecs)

// Default to latest Terraform version
export const defaultTerraformVersion = supportedVersions[supportedVersions.length - 1]
