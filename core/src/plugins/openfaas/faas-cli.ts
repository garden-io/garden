/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginToolSpec } from "../../types/plugin/tools"

export const faasCliSpec: PluginToolSpec = {
  name: "faas-cli",
  description: "The faas-cli command line tool.",
  type: "binary",
  prefetch: false,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://github.com/openfaas/faas-cli/releases/download/0.9.5/faas-cli-darwin",
      sha256: "28beff63ef8234c1c937b14fd63e8c25244432897830650b8f76897fe4e22cbb",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://github.com/openfaas/faas-cli/releases/download/0.9.5/faas-cli",
      sha256: "f4c8014d953f42e0c83628c089aff36aaf306f9f1aea62e5f22c84ab4269d1f7",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://github.com/openfaas/faas-cli/releases/download/0.9.5/faas-cli.exe",
      sha256: "45d09e4dbff679c32aff8f86cc39e12c3687b6b344a9a20510c6c61f4e141eb5",
    },
  ],
}
