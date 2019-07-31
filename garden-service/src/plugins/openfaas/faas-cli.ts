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
      url: "https://github.com/openfaas/faas-cli/releases/download/0.8.21/faas-cli-darwin",
      sha256: "68d99f789e2e0a763b6f58f075f0118b8828fd43b3ca4eed646961eb6ac352fa",
    },
    linux: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.8.21/faas-cli",
      sha256: "b8a5b455f20b14751140cb63277ee4d435e23ed041be1898a0dc2c27ee718046",
    },
    win32: {
      url: "https://github.com/openfaas/faas-cli/releases/download/0.8.21/faas-cli.exe",
      sha256: "366e01a364e64f90bec6b8234c2bc5bb87bbd059b187f8afe43c36d22f4d5b84",
    },
  },
})
