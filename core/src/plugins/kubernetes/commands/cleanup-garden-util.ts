/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { PluginCommand } from "../../../plugin/command.js"
import { utilDeploymentName } from "../container/build/common.js"
import { styles } from "../../../logger/styles.js"
import { deleteResources } from "../kubectl.js"
import type { KubernetesResource } from "../types.js"

export const cleanupUtilDeployment: PluginCommand = {
  name: "cleanup-util-deployment",
  description: `Remove ${utilDeploymentName} utility deployment from the current namespace`,
  title: `Cleanup ${utilDeploymentName} deployment`,
  resolveGraph: true,

  handler: async ({ ctx, log }) => {
    const result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    const namespace = provider.outputs["app-namespace"]
    log.info({ msg: styles.highlight(`\nRemoving ${utilDeploymentName} deployment from namespace ${namespace}`) })

    const targetKinds = ["Service", "Deployment"]
    const resources: KubernetesResource[] = targetKinds.map((kind) => {
      return { apiVersion: "v1", kind, metadata: { name: utilDeploymentName } }
    })

    for (const resource of resources) {
      log.info(`Deleting ${resource.kind}/${resource.metadata.name}`)
      await deleteResources({ ctx, log, provider, namespace, resources })
    }

    log.success("\nDone!")

    return { result }
  },
}
