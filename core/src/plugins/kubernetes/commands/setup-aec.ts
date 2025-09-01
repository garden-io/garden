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
import { makeDocsLinkPlain } from "../../../docs/common.js"
import minimist from "minimist"
import { getSystemNamespace } from "../namespace.js"
import { gardenAecAgentServiceAccountName, getAecAgentManifests } from "../aec.js"
import { CloudApiError } from "../../../exceptions.js"
import { apply } from "../kubectl.js"
import { styles } from "../../../logger/styles.js"
import type { KubernetesResource } from "../types.js"
import chalk from "chalk"

interface Result {
  manifests?: KubernetesResource[]
}

export const setupAecCommand: PluginCommand = {
  name: "setup-aec",
  description: dedent`
    Installs the Automatic Environment Cleanup (AEC) agent in the cluster.

    See the [Automatic Environment Cleanup guide](${makeDocsLinkPlain`garden-for/kubernetes/automatic-environment-cleanup`}) for more information.
  `,
  title: `Install the Automatic Environment Cleanup (AEC) agent in the cluster`,
  resolveGraph: false,

  handler: async ({ ctx, log, args, garden }) => {
    const result: Result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    const api = await KubeApi.factory(log, ctx, provider)

    // Parse args with minimist
    const opts = minimist(args, {
      string: ["image"],
      boolean: ["local-dev"],
    })

    const localDevMode = opts["local-dev"]

    if (localDevMode) {
      log.info({
        msg: chalk.yellow.bold(dedent`
          Running in local dev mode. This will bind mount the local repo into the AEC agent container, so you can make changes to the agent code and see them immediately.
          Please make sure you've built the local dev image with \`npm run local-dev-image:build\` in the root of the repo.
        `),
      })
    }

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

    log.info({ msg: `Acquiring service account and token for AEC agent` })

    const serviceAccount = await cloudApi.getOrCreatServiceAccountAndToken({
      accountId: account.id,
      name: gardenAecAgentServiceAccountName,
    })

    // Note: This is intentionally a hidden option, used for testing only
    const imageOverride = opts.image

    const systemNamespace = await getSystemNamespace(ctx, provider, log)

    const manifests = getAecAgentManifests({
      imageOverride,
      serviceAccessToken: serviceAccount.token,
      systemNamespace,
      description: `projectId=${garden.projectId} context=${provider.config.context} namespace=${systemNamespace}`,
    })

    log.info({
      msg: `Applying ${manifests.length} AEC agent resources to namespace ${styles.highlight(systemNamespace)}: ${manifests.map((m) => `${m.kind}/${m.metadata?.name}`).join(", ")}`,
    })

    result.manifests = manifests

    await apply({ log, ctx, api, provider, manifests })

    log.success("\nDone!")

    return { result }
  },
}
