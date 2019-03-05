/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BinaryCmd } from "../../util/ext-tools"

export const faasCli = new BinaryCmd({
  name: "faas-cli",
  specs: {
    darwin: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.8.3/faas-cli-darwin",
      sha256: "fe3d7933189e234fe9a395ed685584cafac9b36013c3898d1c0dc046a0bdd127",
    },
    linux: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.8.3/faas-cli",
      sha256: "d6a633248b89f4d72ee7113e33e1489e016f111472f5669ff37a01730d20445a",
    },
    win32: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.8.3/faas-cli.exe",
      sha256: "07a191342c7cbbf3d27dbca13a3d318e6eb8941bf055eef09c6e65ba93c77d80",
    },
  },
})
