/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { createGardenPlugin } from "../../types/plugin/plugin"

// TODO: This is deprecated, we should remove it in 0.11.
export const gardenPlugin = createGardenPlugin({
  name: "local-openfaas",
  base: "openfaas",
  dependencies: ["local-kubernetes"],
  handlers: {
    configureProvider: async (params) => {
      params.log.warn({
        symbol: "warning",
        msg: chalk.yellow("The local-openfaas provider has been deprecated. Please use the openfaas provider instead."),
      })
      return params.base!(params)
    },
  },
})
