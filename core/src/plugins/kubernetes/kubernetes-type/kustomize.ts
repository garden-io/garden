/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, joiSparseArray } from "../../../config/common.js"
import type { PluginToolSpec } from "../../../plugin/tools.js"

export interface KubernetesKustomizeSpec {
  path: string
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
      extraArgs: joiSparseArray(joi.string()).description(
        "A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output' is not allowed."
      ),
    })
    .description(
      "Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or `manifests` as well, these are also included."
    )

export const kustomizeVersion = "4.5.7"

export const kustomizeSpec: PluginToolSpec = {
  name: "kustomize",
  version: kustomizeVersion,
  description: `The kustomize config management CLI, v${kustomizeVersion}`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomizeVersion}/kustomize_v${kustomizeVersion}_darwin_amd64.tar.gz`,
      sha256: "6fd57e78ed0c06b5bdd82750c5dc6d0f992a7b926d114fe94be46d7a7e32b63a",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomizeVersion}/kustomize_v${kustomizeVersion}_darwin_arm64.tar.gz`,
      sha256: "3c1e8b95cef4ff6e52d5f4b8c65b8d9d06b75f42d1cb40986c1d67729d82411a",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomizeVersion}/kustomize_v${kustomizeVersion}_linux_amd64.tar.gz`,
      sha256: "701e3c4bfa14e4c520d481fdf7131f902531bfc002cb5062dcf31263a09c70c9",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomizeVersion}/kustomize_v${kustomizeVersion}_linux_arm64.tar.gz`,
      sha256: "65665b39297cc73c13918f05bbe8450d17556f0acd16242a339271e14861df67",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${kustomizeVersion}/kustomize_v${kustomizeVersion}_windows_amd64.tar.gz`,
      sha256: "79af25f97bb10df999e540def94e876555696c5fe42d4c93647e28f83b1efc55",
      extract: {
        format: "tar",
        targetPath: "kustomize.exe",
      },
    },
  ],
}
