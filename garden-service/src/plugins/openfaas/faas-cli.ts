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
      url: "https://github.com/openfaas/faas-cli/releases/download/0.7.3/faas-cli-darwin",
    },
    linux: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.7.3/faas-cli",
    },
    win32: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.7.3/faas-cli.exe",
    },
  },
})
