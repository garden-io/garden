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
  "0.12.26": {
    name: "terraform-0-12-26",
    description: "The terraform CLI, v0.12.26",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_darwin_amd64.zip",
        sha256: "79fb293324012bc981006e1527267987666dd80cff80b11f93fb0ab2e321c450",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_linux_amd64.zip",
        sha256: "607bc802b1c6c2a5e62cc48640f38aaa64bef1501b46f0ae4829feb51594b257",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_windows_amd64.zip",
        sha256: "f232bf25dc32e618fbb692b98857d10a84e16e531e9ce5e87e060c1369bde092",
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
