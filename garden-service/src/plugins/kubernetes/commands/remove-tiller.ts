/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginCommand } from "../../../types/plugin/command"
import chalk from "chalk"
import { KubernetesPluginContext } from "../config"
import { getAppNamespace } from "../namespace"
import { KubeApi } from "../api"
import { removeTiller } from "../helm/tiller"

export const removeTillerCmd: PluginCommand = {
  name: "remove-tiller",
  description: "Remove Tiller from project namespace.",

  title: () => {
    return `Removing Tiller from project namespace`
  },

  handler: async ({ ctx, log }) => {
    const k8sCtx = <KubernetesPluginContext>ctx
    const api = await KubeApi.factory(log, k8sCtx.provider)
    const namespace = await getAppNamespace(ctx, log, k8sCtx.provider)

    await removeTiller(k8sCtx, api, namespace, log)

    log.info(chalk.green("\nDone!"))

    return { result: {} }
  },
}
