/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { PluginCommand } from "../../../plugin/command.js"
import type { KubernetesResource } from "../types.js"
import { createActionLog } from "../../../logger/log-entry.js"
import { apply } from "../kubectl.js"
import { dedent } from "../../../util/string.js"
import { getDeployStatuses } from "../../../commands/get/get-status.js"
import { KubeApi } from "../api.js"
import { styles } from "../../../logger/styles.js"
import type { PausableWorkload } from "../aec.js"
import { isPausable, getPausedResourceManifest } from "../aec.js"

type PauseResult = {
  actionKey: string
  errors?: string[]
  skipped?: string
  updatedWorkloads?: PausableWorkload[]
}

export const pauseCommand: PluginCommand = {
  name: "pause",
  description: dedent`
    Pause all or specified Kubernetes and Helm deployments.

    To pause specific deployments, set any number of Deploy names after " -- ", e.g. "garden plugins kubernetes pause -- deploy1 deploy2"
  `,
  title: `Pause Kubernetes and Helm deployments`,
  resolveGraph: false,

  handler: async ({ ctx, log, args, garden }) => {
    let result: PauseResult[] = []
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    const deployNames = args.length > 0 ? args : undefined

    const graph = await garden.getResolvedConfigGraph({
      log,
      emit: false,
      statusOnly: true,
      actionsFilter: deployNames,
    })

    const deploys = graph
      .getDeploys({ names: deployNames })
      .filter((d) => d.isCompatible("container") || d.isCompatible("kubernetes") || d.isCompatible("helm"))

    if (deploys.length === 0) {
      log.info(
        `No ${styles.highlight("container")}, ${styles.highlight("kubernetes")} or ${styles.highlight("helm")} Deploy actions found.`
      )
      return { result }
    }

    log.info({ msg: `Getting status for ${deploys.length} deployments` })
    const router = await garden.getActionRouter()
    const statuses = await getDeployStatuses(router, graph, log)

    const api = await KubeApi.factory(log, ctx, provider)

    result = await Promise.all(
      deploys.map(async (action): Promise<PauseResult> => {
        const actionKey = action.key()
        const actionLog = createActionLog({ log, action })

        // Check the Deploy status
        const status = statuses[action.name]

        if (!status) {
          const msg = `Could not get status for ${action.type} Deploy ${action.name}`
          actionLog.error({ msg })
          return { actionKey, errors: [msg] }
        }

        const deployState = status.detail?.state

        // If the Deploy is not deployed, log and skip
        if (deployState === "missing") {
          const msg = `Deploy ${action.name} is not deployed, skipping`
          actionLog.info({ msg })
          return { actionKey, skipped: msg }
        } else if (deployState === "deploying") {
          const msg = `Deploy ${action.name} is being deployed, skipping`
          actionLog.info({ msg })
          return { actionKey, skipped: msg }
        } else if (deployState === "stopped") {
          const msg = `Deploy ${action.name} is stopped, skipping`
          actionLog.info({ msg })
          return { actionKey, skipped: msg }
        }

        // If the Deploy is deployed, get the resources from the cluster
        const resources: KubernetesResource[] = status.detail?.detail.remoteResources || []

        if (resources.length === 0) {
          const msg = `Deploy ${action.name} has no resources, skipping`
          actionLog.info({ msg })
          return { actionKey, skipped: msg }
        }

        // Filter to the workloads
        // TODO: Should we also remove DaemonSets? (those don't have spec.replicas)
        const workloads = resources.filter(isPausable)

        if (workloads.length === 0) {
          const msg = `Deploy ${action.name} has no workloads that can be paused, skipping`
          actionLog.info({ msg })
          return { actionKey, skipped: msg }
        }

        // Update the workloads
        const updatedWorkloads = workloads.map(getPausedResourceManifest)

        // Apply the updates
        actionLog.info({
          msg: `Pausing ${workloads.length} workloads: ${workloads.map((w) => `${w.kind}/${w.metadata.name}`).join(", ")}`,
        })

        const spec = action.getSpec()

        const errors: string[] = []

        await Promise.all(
          updatedWorkloads.map(async (workload) => {
            const manifest = getPausedResourceManifest(workload)
            try {
              await apply({
                log,
                ctx,
                api,
                provider,
                manifests: [manifest],
                applyArgs: spec.applyArgs,
                setHashAnnotation: false,
              })
            } catch (e) {
              const msg = `Error pausing workload ${workload.kind}/${workload.metadata.name}: ${e}`
              actionLog.error({ msg })
              errors.push(msg)
            }
          })
        )

        return { actionKey, errors, updatedWorkloads }
      })
    )

    log.success("\nDone!")

    return { result }
  },
}
