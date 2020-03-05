/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BinaryCmd, LibraryExtractSpec } from "../../util/ext-tools"
import { ConfigurationError } from "../../exceptions"

export function terraform(version: string) {
  const cli = terraformClis[version]

  if (!cli) {
    throw new ConfigurationError(`Unsupported Terraform version: ${version}`, {
      version,
      supportedVersions,
    })
  }

  return cli
}

const extract: LibraryExtractSpec = {
  format: "zip",
  targetPath: ["terraform"],
}

export const terraformClis: { [version: string]: BinaryCmd } = {
  "0.11.14": new BinaryCmd({
    name: "terraform-0.11.14",
    specs: {
      darwin: {
        url: "https://releases.hashicorp.com/terraform/0.11.14/terraform_0.11.14_darwin_amd64.zip",
        sha256: "829bdba148afbd61eab4aafbc6087838f0333d8876624fe2ebc023920cfc2ad5",
        extract,
      },
      linux: {
        url: "https://releases.hashicorp.com/terraform/0.11.14/terraform_0.11.14_linux_amd64.zip",
        sha256: "9b9a4492738c69077b079e595f5b2a9ef1bc4e8fb5596610f69a6f322a8af8dd",
        extract,
      },
      win32: {
        url: "https://releases.hashicorp.com/terraform/0.11.14/terraform_0.11.14_windows_amd64.zip",
        sha256: "bfec66e2ad079a1fab6101c19617a82ef79357dc1b92ddca80901bb8d5312dc0",
        extract,
      },
    },
  }),
  "0.12.7": new BinaryCmd({
    name: "terraform-0.12.7",
    specs: {
      darwin: {
        url: "https://releases.hashicorp.com/terraform/0.12.7/terraform_0.12.7_darwin_amd64.zip",
        sha256: "5cb59cdc4a8c4ebdfc0b8715936110e707d869c59603d27020e33b2be2e50f21",
        extract,
      },
      linux: {
        url: "https://releases.hashicorp.com/terraform/0.12.7/terraform_0.12.7_linux_amd64.zip",
        sha256: "a0fa11217325f76bf1b4f53b0f7a6efb1be1826826ef8024f2f45e60187925e7",
        extract,
      },
      win32: {
        url: "https://releases.hashicorp.com/terraform/0.12.7/terraform_0.12.7_windows_amd64.zip",
        sha256: "ce5b0eae0b443cbbb7c592d1b48bad6c8a3c5298932d35a4ebcba800c3488e4e",
        extract,
      },
    },
  }),
  "0.12.21": new BinaryCmd({
    name: "terraform-0.12.21",
    specs: {
      darwin: {
        url: "https://releases.hashicorp.com/terraform/0.12.21/terraform_0.12.21_darwin_amd64.zip",
        sha256: "f89b620e59439fccc80950bbcbd37a069101cbef7029029a12227eee831e463f",
        extract,
      },
      linux: {
        url: "https://releases.hashicorp.com/terraform/0.12.21/terraform_0.12.21_linux_amd64.zip",
        sha256: "ca0d0796c79d14ee73a3d45649dab5e531f0768ee98da71b31e423e3278e9aa9",
        extract,
      },
      win32: {
        url: "https://releases.hashicorp.com/terraform/0.12.21/terraform_0.12.21_windows_amd64.zip",
        sha256: "254e5f870efe9d86a3f211a1b9c3c01325fc380e428f54542b7750d8bfd62bb1",
        extract,
      },
    },
  }),
}

export const supportedVersions = Object.keys(terraformClis)

// Default to latest Terraform version
export const defaultTerraformVersion = supportedVersions[supportedVersions.length - 1]
