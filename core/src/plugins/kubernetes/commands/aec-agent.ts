/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { PluginCommand } from "../../../plugin/command.js"
import { dedent, gardenAnnotationKey } from "../../../util/string.js"
import { KubeApi } from "../api.js"
import minimist from "minimist"
import { CloudApiError } from "../../../exceptions.js"
import { sleep } from "../../../util/util.js"
import { styles } from "../../../logger/styles.js"
import type { Log } from "../../../logger/log-entry.js"
import type { EnvironmentAecConfig } from "../../../config/aec.js"
import { aecConfigSchema } from "../../../config/aec.js"
import { validateSchema } from "../../../config/validation.js"

const defaultCleanupInterval = 60000
const recycleAfterMinutes = 60 * 24 // 24 hours

export const aecAgentCommand: PluginCommand = {
  name: "aec-agent",
  description: dedent`
    [INTERNAL]

    Starts the AEC agent service, meant to run inside a Kubernetes cluster Pod.
  `,
  title: `[INTERNAL]Start the AEC agent service`,
  resolveGraph: false,
  hidden: true,

  handler: async ({ ctx, log, args, garden }) => {
    const result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    const opts = minimist(args, {
      string: ["interval"],
    })

    let interval = defaultCleanupInterval

    if (opts["interval"]) {
      try {
        interval = parseInt(opts["interval"], 10)
      } catch (e) {
        log.error({ msg: `Invalid interval: ${opts["interval"]}` })
        return { result }
      }
    }

    const api = await KubeApi.factory(log, ctx, provider)

    // TODO: Deduplicate this with the setup-aec command
    const cloudApi = garden.cloudApiV2

    if (!cloudApi) {
      if (garden.cloudApi) {
        throw new CloudApiError({
          message:
            "You must be logged in to app.garden.io to use this command. Single-tenant Garden Enterprise is currently not supported.",
        })
      }

      throw new CloudApiError({
        message:
          "You must be logged in to Garden Cloud and have admin access to your project's organization to use this command.",
      })
    }

    const organization = await cloudApi.getOrganization()

    if (organization.plan === "free") {
      throw new CloudApiError({
        message: `Your organization (${organization.name}) is on the Free plan. The AEC feature is currentlyonly available on paid plans. Please upgrade your organization to continue.`,
      })
    }

    const account = await cloudApi.getCurrentAccount()

    // Note: This shouldn't happen
    if (!account) {
      throw new CloudApiError({
        message: "You must be logged in to Garden Cloud to use this command.",
      })
    }

    const startTime = new Date()

    while (true) {
      const exit = await cleanupLoop({ log, ctx, api })
      const now = new Date()
      const timeSinceStart = now.getTime() - startTime.getTime()
      const minutesSinceStart = timeSinceStart / 60000

      if (minutesSinceStart > recycleAfterMinutes) {
        log.info({
          msg: styles.warning(`AEC agent service stopping to recycle after ${minutesSinceStart} minutes`),
        })
        break
      }

      if (exit) {
        break
      }
      await sleep(interval)
    }

    log.info({ msg: styles.warning("AEC agent service stopped") })

    return { result }
  },
}

async function cleanupLoop({ log, api }: { log: Log; ctx: KubernetesPluginContext; api: KubeApi }) {
  log.info({ msg: "Checking namespaces..." })

  const allNamespaces = await api.core.listNamespace()

  await Promise.all(
    allNamespaces.items.map(async (ns) => {
      const annotations = ns.metadata?.annotations || {}

      const aecStatusAnnotation = annotations[gardenAnnotationKey("aec-status")]
      const aecConfigAnnotation = annotations[gardenAnnotationKey("aec-config")]
      const aecForceAnnotation = annotations[gardenAnnotationKey("aec-force")]
      const lastDeployedAnnotation = annotations[gardenAnnotationKey("last-deployed")]

      let aecConfigured = false
      let aecStatus = "unknown"
      let lastDeployed: Date | null = null

      if (aecStatusAnnotation === "paused") {
        aecStatus = "paused"
      }

      if (aecConfigAnnotation) {
        let aecConfigParsed: EnvironmentAecConfig

        try {
          aecConfigParsed = JSON.parse(aecConfigAnnotation)
        } catch (e) {
          log.error({ msg: `Invalid AEC config in namespace ${ns.metadata?.name} - Could not parse JSON: ${e}` })
          return
        }

        try {
          validateSchema(aecConfigParsed, aecConfigSchema())
        } catch (e) {
          log.error({ msg: `Invalid AEC config in namespace ${ns.metadata?.name}: ${e}` })
          return
        }

        if (!aecConfigParsed.disabled && aecConfigParsed.triggers.length > 0) {
          aecConfigured = true
        }
      }

      if (lastDeployedAnnotation) {
        try {
          lastDeployed = new Date(lastDeployedAnnotation)
        } catch (e) {
          log.error({
            msg: `Invalid last deployed annotation in namespace ${ns.metadata?.name} - Could not parse date: ${e}`,
          })
          return
        }
      }

      const now = new Date()

      const stringStatus: string[] = [aecConfigured ? "AEC configured" : "AEC not configured"]

      if (aecStatus === "paused") {
        stringStatus.push("Workloads paused")
      }

      if (lastDeployed) {
        // Log time since last deployed in HH:MM:SS format
        const timeSinceLastDeployed = now.getTime() - lastDeployed.getTime()
        const hours = Math.floor(timeSinceLastDeployed / 3600000)
        const minutes = Math.floor((timeSinceLastDeployed % 3600000) / 60000)
        const seconds = Math.floor((timeSinceLastDeployed % 60000) / 1000)
        stringStatus.push(`Last deployed ${hours}:${minutes}:${seconds} ago`)
      }

      log.info({ msg: `${ns.metadata?.name} -> ${stringStatus.join(" | ")}` })

      if (aecForceAnnotation) {
        log.info({ msg: `${ns.metadata?.name} -> AEC force triggered: ${aecForceAnnotation}` })
        if (!aecConfigured) {
          log.info({ msg: `${ns.metadata?.name} -> AEC not configured, skipping force cleanup` })
          return
        }
      }
    })
  )

  return false
}
