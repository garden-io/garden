/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "../types/plugin/plugin"
import { execPlugin, execModuleSpecSchema } from "./exec"

export const gardenPlugin = createGardenPlugin({
  name: "npm-package",
  createModuleTypes: [
    {
      name: "npm-package",
      docs: "[DEPRECATED]",
      schema: execModuleSpecSchema,
      handlers: {
        ...execPlugin.createModuleTypes![0].handlers,
      },
    },
  ],
})
