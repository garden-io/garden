/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../../logger/log-entry"
import { KubernetesResource } from "../types"
import { helm, helmPlugin2to3 } from "./helm-cli"
import { safeLoadAll, safeDump } from "js-yaml"
import { KubeApi, getKubeConfig } from "../api"
import { checkResourceStatuses } from "../status/status"
import { combineStates } from "../../../types/service"
import { KubernetesPluginContext } from "../config"
import { convertDeprecatedManifestVersion } from "../util"
import Bluebird from "bluebird"
import tmp from "tmp-promise"
import { findByName, getNames } from "../../../util/util"
import { ConfigurationError } from "../../../exceptions"
import { writeFile } from "fs-extra"
import { resolve } from "path"
import { getValueArgs, getChartPath, getReleaseName } from "./common"
import { Garden } from "../../../garden"
import chalk from "chalk"
import { gardenAnnotationKey } from "../../../util/string"

// DEPRECATED: remove all this in v0.12.0

const serviceAccountName = "garden-tiller"

export async function checkTillerStatus(ctx: KubernetesPluginContext, api: KubeApi, namespace: string, log: LogEntry) {
  const manifests = await getTillerManifests(ctx, log, namespace)
  const statuses = await checkResourceStatuses(api, namespace, manifests, log)

  return combineStates(statuses.map((s) => s.state))
}

export async function migrateToHelm3({
  ctx,
  api,
  namespace,
  log,
  sysGarden,
  cleanup,
}: {
  ctx: KubernetesPluginContext
  api: KubeApi
  namespace: string
  log: LogEntry
  sysGarden?: Garden
  cleanup: boolean
}) {
  const migrationLog = log.info(`-> Migrating from Helm 2.x (Tiller) to Helm 3 in namespace ${namespace}`)

  let res: any
  // List all releases in Helm 2 (Tiller)
  try {
    res = await helm({
      ctx,
      namespace,
      log,
      args: ["list", "--output", "json"],
      version: 2,
    })
  } catch (error) {
    log.silly("No tiller deployments found. Will continue and try to remove other existing Helm resources.")
  }

  // If helm is deployed we continue with the removal process
  // If no releases are found we skip this and we remove the remaining resources before returning.
  if (res) {
    // ... of course it returns an empty string when there are no releases
    const listFromTiller = res.trim() === "" ? { Releases: [] } : JSON.parse(res)
    const tillerReleaseNames = listFromTiller.Releases.filter((r: any) => r.Status === "DEPLOYED").map(
      (r: any) => r.Name
    )

    // Ok, so, here's the deal:
    //
    // We had to upgrade the nginx-ingress chart because the previous version was outdated
    // and buggy. That wasn't an issue with Helm 2.
    //
    // However, Helm 3 is unable to upgrade the chart because of this issue:
    // https://github.com/helm/helm/issues/6646#issuecomment-547650430 (basically, Helm 3 can't upgrade
    // because the new chart has a different apiVersion).
    //
    // So users that still have the old garden-nginx release but have migrated to Helm 3 will have issues.
    //
    // We therefore check if the garden-nginx release is deployed, and if so, use the chance to upgrade
    // it with Helm 2 before migrating to Helm 3. This should be a no-op if the chart is alrady up to date.
    const nginxDeployed = !!listFromTiller.Releases.find(
      (r: any) => r.Name === "garden-nginx" && r.Status === "DEPLOYED"
    )
    if (nginxDeployed && sysGarden) {
      log.info(chalk.gray(`-> Migrating release ${namespace}/garden-nginx from Tiller to Helm 3`))
      log.debug("Using Helm 2 to upgrade the garden-nginx release")
      const actionRouter = await sysGarden.getActionRouter()
      const dg = await sysGarden.getConfigGraph(log)
      const module = await dg.getModule("ingress-controller")
      // Ensure the module is built
      await actionRouter.build({ module, log })

      const commonArgs = [
        "--namespace",
        namespace,
        "--timeout",
        module.spec.timeout.toString(10), // Helm 2 style, without "+s"
        ...(await getValueArgs(module, false)),
      ]

      const chartPath = await getChartPath(module)
      const releaseName = getReleaseName(module)
      const upgradeArgs = ["upgrade", releaseName, chartPath, "--install", "--force", ...commonArgs]
      await helm({ ctx, namespace, log, args: [...upgradeArgs], version: 2 })
    }

    // List all releases in Helm 3
    const listFromHelm3 = JSON.parse(
      await helm({
        ctx,
        namespace,
        log,
        args: ["list", "--output", "json"],
      })
    )
    const helm3ReleaseNames = listFromHelm3.map((r: any) => r.name)

    // Convert each release from Tiller that isn't already in Helm 3
    for (const releaseName of tillerReleaseNames) {
      if (helm3ReleaseNames.includes(releaseName)) {
        continue
      }

      migrationLog.info(`-> Migrating release ${namespace}/${releaseName} from Tiller to Helm 3`)

      // The 2to3 plugin doesn't support multiple files in KUBECONFIG, and does not support/respect the
      // --kube-context parameter at all. I'm sure for really good reasons because this is not important
      // at all. (Yeah I'm pissed off because this has wasted a lot of my time, sorrynotsorry.)
      // So (breathe deep) we need to extract a temporary kube config file for the occasion.
      const tmpDir = await tmp.dir({ unsafeCleanup: true })

      try {
        const config = await getKubeConfig(log, ctx.provider)

        const contextName = ctx.provider.config.context
        const context = findByName(config.contexts, contextName)

        if (!context) {
          const contextNames = getNames(config.contexts)
          throw new ConfigurationError(`Could not find context ${contextName}`, { contextName, contextNames })
        }

        const clusterName = context.context.cluster
        const cluster = findByName(config.clusters, clusterName)

        if (!cluster) {
          const clusterNames = getNames(config.clusters)
          throw new ConfigurationError(`Could not find cluster ${clusterName} referenced in context ${contextName}`, {
            clusterName,
            contextName,
            clusterNames,
          })
        }

        const userName = context.context.user
        const user = findByName(config.users, userName)

        if (!user) {
          const userNames = getNames(config.users)
          throw new ConfigurationError(`Could not find user ${userName} referenced in context ${contextName}`, {
            userName,
            contextName,
            clusterNames: userNames,
          })
        }

        const resolvedConfig = {
          "apiVersion": "v1",
          "kind": "Config",
          "preferences": config.preferences || {},
          "current-context": context.name,
          "contexts": [context],
          "clusters": [cluster],
          "users": [user],
        }

        const configPath = resolve(tmpDir.path, "kubeconfig.json")
        await writeFile(configPath, safeDump(resolvedConfig))

        log.debug(
          // It's not possible to install/update/execute Helm plugins on Windows because of this:
          // https://github.com/helm/helm-2to3/issues/55
          // So instead we download and execute the plugin binary directly, without passing it through the Helm CLI.
          await helmPlugin2to3.stdout({
            log,
            args: ["convert", releaseName, "--tiller-ns", namespace],
            env: {
              KUBECONFIG: configPath,
            },
          })
        )
      } finally {
        await tmpDir.cleanup()
      }
    }
  }

  // Mark namespace as migrated
  const ns = await api.core.readNamespace(namespace)
  const annotations = { [gardenAnnotationKey("helm-migrated")]: "true" }
  await api.annotateResource({ log, resource: ns, annotations })

  if (cleanup) {
    log.info(`-> Removing Tiller from namespace ${namespace}`)
    await removeTiller(ctx, api, namespace, log)

    log.info(`-> Helm 3 migration complete!`)
  } else {
    const removeTillerCmd = chalk.yellow.bold.underline(
      `garden plugins ${ctx.provider.name} remove-tiller --env ${ctx.environmentName}`
    )
    log.info(`-> Helm 3 migration complete!`)
    log.info(chalk.yellow(`-> Please run ${removeTillerCmd} to remove Tiller and related resources.`))
  }
}

export async function removeTiller(ctx: KubernetesPluginContext, api: KubeApi, namespace: string, log: LogEntry) {
  const manifests = await getTillerManifests(ctx, log, namespace)

  return Bluebird.map(manifests, (resource) => api.deleteBySpec({ namespace, manifest: resource, log }))
}

async function getTillerManifests(
  ctx: KubernetesPluginContext,
  log: LogEntry,
  namespace: string
): Promise<KubernetesResource[]> {
  const tillerManifests = await helm({
    ctx,
    log,
    namespace,
    args: ["init", "--service-account", serviceAccountName, "--dry-run", "--debug"],
    version: 2,
  })

  const resources = safeLoadAll(tillerManifests).map(convertDeprecatedManifestVersion)

  return [...getRoleManifests(namespace), ...resources]
}

function getRoleManifests(namespace: string) {
  return [
    {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name: serviceAccountName,
        namespace,
      },
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "Role",
      metadata: {
        name: serviceAccountName,
        namespace,
      },
      rules: [
        {
          apiGroups: ["*"],
          resources: ["*"],
          verbs: ["*"],
        },
      ],
    },
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "RoleBinding",
      metadata: {
        name: serviceAccountName,
        namespace,
      },
      roleRef: {
        kind: "Role",
        name: serviceAccountName,
        apiGroup: "rbac.authorization.k8s.io",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: serviceAccountName,
          namespace,
        },
      ],
    },
    // TODO: either get rid of Tiller entirely, or find a more narrow (yet usable) way to limit permissions
    // cluster-wide. The reason for this is that often Helm charts contain cluster-scoped objects that are in practice
    // difficult to limit the creation of, especically for dev.
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: {
        name: serviceAccountName + "-cluster-admin",
      },
      roleRef: {
        kind: "ClusterRole",
        name: "cluster-admin",
        apiGroup: "rbac.authorization.k8s.io",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: serviceAccountName,
          namespace,
        },
      ],
    },
  ]
}
