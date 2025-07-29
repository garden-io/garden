/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { PluginCommand } from "../../../plugin/command.js"
import { dedent } from "../../../util/string.js"
import { KubeApi } from "../api.js"
import { styles } from "../../../logger/styles.js"
import { uniq } from "lodash-es"
import { getActionNamespace, updateNamespaceAecAnnotations } from "../namespace.js"
import type { KubernetesResource } from "../types.js"
import type { V1Namespace } from "@kubernetes/client-node"

type Result = {
  namespaceName: string
  errors?: string[]
  skipped?: string
  updatedNamespaces?: KubernetesResource<V1Namespace>[]
}

export const keepAliveCommand: PluginCommand = {
  name: "keep-alive",
  description: dedent`
    Updates metadata on deployed namespaces to delay automatic cleanup via Automatic Environment Cleanup (AEC).
  `,
  title: `Update namespace metadata to delay automatic cleanup`,
  resolveGraph: false,

  handler: async ({ ctx, log, garden }) => {
    const result: Result[] = []
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    const graph = await garden.getResolvedConfigGraph({
      log,
      emit: false,
      statusOnly: true,
    })

    const deploys = graph
      .getDeploys()
      .filter((d) => d.isCompatible("container") || d.isCompatible("kubernetes") || d.isCompatible("helm"))

    if (deploys.length === 0) {
      log.info(
        `No ${styles.highlight("container")}, ${styles.highlight("kubernetes")} or ${styles.highlight("helm")} Deploy actions found.`
      )
      return { result }
    }

    const namespaces = uniq(
      await Promise.all(
        deploys.map(async (d) => getActionNamespace({ ctx, log, action: d, provider, skipCreate: true }))
      )
    )

    log.info({
      msg: `Updating metadata for ${namespaces.length} namespace(s): ${styles.highlight(namespaces.join(", "))}.`,
    })

    const api = await KubeApi.factory(log, ctx, provider)

    await Promise.all(
      namespaces.map(async (ns) => {
        try {
          const resource = await api.core.readNamespace({ name: ns })

          if (!resource) {
            const msg = `Namespace ${styles.highlight(ns)} not found in cluster. Skipping.`
            log.error({ msg })
            return { namespaceName: ns, skipped: msg }
          }

          const updatedResource = await updateNamespaceAecAnnotations(ctx, api, ns)

          return { namespaceName: ns, updatedResource }
        } catch (e) {
          const msg = `Error updating namespace ${styles.highlight(ns)}: ${e}`
          log.error({ msg })
          return { namespaceName: ns, errors: [msg] }
        }
      })
    )

    log.success("\nDone!")

    return { result }
  },
}
