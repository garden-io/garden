/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { gardenPlugin as k8sPlugin } from "../kubernetes"
import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../types/plugin/plugin"

export const gardenPlugin = createGardenPlugin({
  ...k8sPlugin,
  name: "local-kubernetes",
  configSchema,
  handlers: {
    ...k8sPlugin.handlers!,
    configureProvider,
  },
})
