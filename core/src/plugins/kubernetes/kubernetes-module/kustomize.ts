/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, joiSparseArray } from "../../../config/common"
import { PluginToolSpec } from "../../../types/plugin/tools"

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
          "The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the module root. Defaults to the module root. If you set this to null, kustomize will not be run."
        ),
      extraArgs: joiSparseArray(joi.string()).description(
        "A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output' is not allowed."
      ),
    })
    .description(
      "Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or `manifests` as well, these are also included."
    )

export const kustomizeSpec: PluginToolSpec = {
  name: "kustomize",
  description: "The kustomize config management CLI.",
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url:
        "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv4.5.2/kustomize_v4.5.2_darwin_amd64.tar.gz",
      sha256: "4b7dac92c8f2dd383651276c78d9e6d28031f50f3711cd987347a08edf0c8335",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url:
        "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv4.5.2/kustomize_v4.5.2_linux_amd64.tar.gz",
      sha256: "c4215332da8da16ddeb88e218d8dceb76c85b366a5c58d012bc5ece904bf2fd0",
      extract: {
        format: "tar",
        targetPath: "kustomize",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url:
        "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv4.5.2/kustomize_v4.5.2_windows_amd64.tar.gz",
      sha256: "3c6310caa6a23d17711a312f1a33690365ba6be9a806752aac215613fdf7c605",
      extract: {
        format: "tar",
        targetPath: "kustomize.exe",
      },
    },
  ],
}
