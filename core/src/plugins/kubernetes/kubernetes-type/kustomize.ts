/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, joiSparseArray } from "../../../config/common.js"
import type { PluginToolSpec } from "../../../plugin/tools.js"

export interface KubernetesKustomizeSpec {
  path: string
  version: number
  extraArgs?: string[]
}

export const kustomizeSpecSchema = () =>
  joi
    .object()
    .keys({
      path: joi
        .alternatives(joi.posixPath().relativeOnly().subPathOnly(), joi.string().uri())
        .default(".")
        .allow(null)
        .description(
          "The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the action root. Defaults to the action root. If you set this to null, kustomize will not be run."
        ),
      version: joi.number().integer().valid(4, 5).default(5).description("The Kustomize version to use."),
      extraArgs: joiSparseArray(joi.string()).description(
        "A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output' is not allowed."
      ),
    })
    .description(
      "Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or `manifests` as well, these are also included."
    )

export const kustomize4Version = "4.5.7"

export const kustomize4Spec: PluginToolSpec = {
  name: "kustomize-4",
  version: kustomize4Version,
  description: `The kustomize config management CLI, v${kustomize4Version}`,
  type: "binary",
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize4Version}/kustomize_v${kustomize4Version}_darwin_amd64.tar.gz`,
      sha256: "6fd57e78ed0c06b5bdd82750c5dc6d0f992a7b926d114fe94be46d7a7e32b63a",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize4Version}/kustomize_v${kustomize4Version}_darwin_arm64.tar.gz`,
      sha256: "3c1e8b95cef4ff6e52d5f4b8c65b8d9d06b75f42d1cb40986c1d67729d82411a",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize4Version}/kustomize_v${kustomize4Version}_linux_amd64.tar.gz`,
      sha256: "701e3c4bfa14e4c520d481fdf7131f902531bfc002cb5062dcf31263a09c70c9",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize4Version}/kustomize_v${kustomize4Version}_linux_arm64.tar.gz`,
      sha256: "65665b39297cc73c13918f05bbe8450d17556f0acd16242a339271e14861df67",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize4Version}/kustomize_v${kustomize4Version}_windows_amd64.tar.gz`,
      sha256: "79af25f97bb10df999e540def94e876555696c5fe42d4c93647e28f83b1efc55",
      extract: {
        format: "tar",
        targetPath: "kustomize.exe",
      },
    },
  ],
}

export const kustomize5Version = "5.4.2"

export const kustomize5Spec: PluginToolSpec = {
  name: "kustomize-5",
  version: kustomize5Version,
  description: `The kustomize config management CLI, v${kustomize5Version}`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize5Version}/kustomize_v${kustomize5Version}_darwin_amd64.tar.gz`,
      sha256: "d1dadf6d51058cdda6470344c95767e1c283cc5a36d5019eb32f8e43e63bd0df",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize5Version}/kustomize_v${kustomize5Version}_darwin_arm64.tar.gz`,
      sha256: "9b7da623cb40542f2dd220fa31d906d9254759b4e27583706e4e846fccba9fab",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize5Version}/kustomize_v${kustomize5Version}_linux_amd64.tar.gz`,
      sha256: "881c6e9007c7ea2b9ecc214d13f4cdd1f837635dcf4db49ce4479898f7d911a3",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize5Version}/kustomize_v${kustomize5Version}_linux_arm64.tar.gz`,
      sha256: "175af88af8a7d8d7d6b1f26659060950f0764d00b9979b4e11b61b8b212b7c22",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomize5Version}/kustomize_v${kustomize5Version}_windows_amd64.zip`,
      sha256: "56a91ef90f2f3a9625004a053d002e15039dfe3c6222113d97be9568511a6ae4",
      extract: {
        format: "zip",
        targetPath: "kustomize.exe",
      },
    },
  ],
}
