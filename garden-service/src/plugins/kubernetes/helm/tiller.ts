/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesResource } from "../types"
import { helm } from "./helm-cli"
import { safeLoadAll } from "js-yaml"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { checkResourceStatuses, waitForResources } from "../status"
import { combineStates } from "../../../types/service"
import { applyMany } from "../kubectl"
import { KubernetesProvider } from "../kubernetes"
import chalk from "chalk"

export async function checkTillerStatus(ctx: PluginContext, provider: KubernetesProvider, log: LogEntry) {
  const resources = await getTillerResources(ctx, provider, log)
  const api = new KubeApi(provider)
  const namespace = await getAppNamespace(ctx, provider)
  const statuses = await checkResourceStatuses(api, namespace, resources)

  return combineStates(statuses.map(s => s.state))
}

export async function installTiller(ctx: PluginContext, provider: KubernetesProvider, log: LogEntry) {
  const entry = log.info({
    section: "tiller",
    msg: "Installing...",
    status: "active",
  })

  const resources = await getTillerResources(ctx, provider, log)
  const pruneSelector = "app=helm,name=tiller"
  const namespace = await getAppNamespace(ctx, provider)
  const context = provider.config.context

  await applyMany(context, resources, { namespace, pruneSelector })
  await waitForResources({ ctx, provider, serviceName: "tiller", resources, log })

  entry.setSuccess({ msg: chalk.green(`Done (took ${entry.getDuration(1)} sec)`), append: true })
}

async function getTillerResources(
  ctx: PluginContext, provider: KubernetesProvider, log: LogEntry,
): Promise<KubernetesResource[]> {
  const namespace = await getAppNamespace(ctx, provider)
  const context = provider.config.context

  const manifests = await helm(namespace, context, log,
    "init",
    "--service-account", "default",
    "--dry-run",
    "--debug",
  )

  return safeLoadAll(manifests)
}
