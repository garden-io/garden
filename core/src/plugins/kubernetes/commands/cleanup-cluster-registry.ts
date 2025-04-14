/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginCommand } from "../../../plugin/command.js"
import { reportDeprecatedFeatureUsage } from "../../../util/deprecations.js"

export const cleanupClusterRegistry: PluginCommand = {
  name: "cleanup-cluster-registry",
  description: "[NO LONGER USED]",

  title: "Cleaning up caches and unused images from the in-cluster registry",

  handler: async ({ log }) => {
    reportDeprecatedFeatureUsage({ deprecation: "kubernetesPluginCleanupClusterRegistryCommand", log })
    return { result: {} }
  },
}
