/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { mkdirp, pathExists, readFile, remove, writeFile } from "fs-extra"
import { join } from "path"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { k8sGetContainerDeployStatus } from "../../../../../src/plugins/kubernetes/container/status"
import { createActionLog, Log } from "../../../../../src/logger/log-entry"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import { getMutagenMonitor, Mutagen } from "../../../../../src/mutagen"
import { KubernetesWorkload } from "../../../../../src/plugins/kubernetes/types"
import { execInWorkload } from "../../../../../src/plugins/kubernetes/util"
import { dedent } from "../../../../../src/util/string"
import { sleep } from "../../../../../src/util/util"
import { getContainerTestGarden } from "./container/container"
import {
  convertContainerSyncSpec,
  convertKubernetesModuleDevModeSpec,
} from "../../../../../src/plugins/kubernetes/sync"
import { HelmModuleConfig } from "../../../../../src/plugins/kubernetes/helm/module-config"
import { KubernetesModuleConfig } from "../../../../../src/plugins/kubernetes/kubernetes-type/module-config"
import { TestGarden, cleanProject } from "../../../../helpers"
import { ContainerDeployActionConfig } from "../../../../../src/plugins/container/moduleConfig"
import { resolveAction } from "../../../../../src/graph/actions"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { MUTAGEN_DIR_NAME } from "../../../../../src/constants"

describe("sync mode deployments and sync behavior", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider

  const execInPod = async (command: string[], log: Log, workload: KubernetesWorkload) => {
    const execRes = await execInWorkload({
      command,
      ctx,
      provider,
      log,
      namespace: provider.config.namespace!.name!,
      workload,
      interactive: false,
    })
    return execRes
  }

  before(async () => {
    await init("local")
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  afterEach(async () => {
    if (garden) {
      garden.close()
      const dataDir = join(garden.gardenDirPath, MUTAGEN_DIR_NAME)
      await getMutagenMonitor({ log: garden.log, dataDir }).stop()
      await cleanProject(garden.gardenDirPath)
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName, { noTempDir: true })
    graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      noCache: true,
      actionModes: {
        sync: ["deploy.sync-mode"],
      },
    })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
  }

  // todo: fix this test, It works locally, fails on ci
  it.skip("should deploy a service in sync mode and successfully set a two-way sync", async () => {
    await init("local")
    const action = graph.getDeploy("sync-mode")
    const log = garden.log
    const deployTask = new DeployTask({
      garden,
      graph,
      log,
      action,
      force: true,
      startSync: true,
    })

    await garden.processTasks({ tasks: [deployTask], throwOnError: true })
    const resolvedAction = await garden.resolveAction({
      action,
      log: garden.log,
      graph: await garden.getConfigGraph({ log: garden.log, emit: false, actionModes: { sync: ["deploy.sync-mode"] } }),
    })
    const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

    const status = await k8sGetContainerDeployStatus({
      ctx,
      action: resolvedAction,
      log: actionLog,
    })
    expect(status.detail?.mode).to.equal("sync")

    const workload = status.detail?.detail.workload!

    // First, we create a file locally and verify that it gets synced into the pod
    const actionPath = action.basePath()
    await writeFile(join(actionPath, "made_locally"), "foo")
    await sleep(300)
    const execRes = await execInPod(["/bin/sh", "-c", "cat /tmp/made_locally"], log, workload)
    expect(execRes.output.trim()).to.eql("foo")

    // Then, we create a file in the pod and verify that it gets synced back
    await execInPod(["/bin/sh", "-c", "echo bar > /tmp/made_in_pod"], log, workload)
    await sleep(500)
    const localPath = join(actionPath, "made_in_pod")
    expect(await pathExists(localPath)).to.eql(true)
    expect((await readFile(localPath)).toString().trim()).to.eql("bar")

    // This is to make sure that the two-way sync doesn't recreate the local files we're about to delete here.
    const actions = await garden.getActionRouter()
    await actions.deploy.delete({ graph, log: actionLog, action: resolvedAction })

    // Clean up the files we created locally
    for (const filename of ["made_locally", "made_in_pod"]) {
      try {
        await remove(join(actionPath, filename))
      } catch {}
    }
  })

  // todo: fix this test, It works locally, fails on ci.
  it.skip("should apply ignore rules from the sync spec and the provider-level sync defaults", async () => {
    await init("local")
    const action = graph.getDeploy("sync-mode")

    // We want to ignore the following directories (all at module root)
    // somedir
    // prefix-a         <--- matched by provider-level default excludes
    // nested/prefix-b  <--- matched by provider-level default excludes

    action["_config"].spec.sync!.paths[0].mode = "one-way-replica"
    action["_config"].spec.sync!.paths[0].exclude = ["somedir"]
    const log = garden.log
    const deployTask = new DeployTask({
      garden,
      graph,
      log,
      action,
      force: true,
      startSync: true,
    })

    await garden.processTasks({ tasks: [deployTask], throwOnError: true })
    const resolvedAction = await garden.resolveAction({
      action,
      log: garden.log,
      graph: await garden.getConfigGraph({ log: garden.log, emit: false, actionModes: { sync: ["deploy.sync-mode"] } }),
    })
    const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
    const status = await k8sGetContainerDeployStatus({
      ctx,
      action: resolvedAction,
      log: actionLog,
    })

    const workload = status.detail?.detail.workload!
    const actionPath = action.basePath()

    // First, we create a non-ignored file locally
    await writeFile(join(actionPath, "made_locally"), "foo")

    // Then, we create files in each of the directories we intended to ignore in the `exclude` spec above, and
    // verify that they didn't get synced into the pod.
    await mkdirp(join(actionPath, "somedir"))
    await writeFile(join(actionPath, "somedir", "file"), "foo")
    await mkdirp(join(actionPath, "prefix-a"))
    await writeFile(join(actionPath, "prefix-a", "file"), "foo")
    await mkdirp(join(actionPath, "nested", "prefix-b"))
    await writeFile(join(actionPath, "nested", "prefix-b", "file"), "foo")

    await sleep(1000)
    const mutagen = new Mutagen({ ctx, log })
    await mutagen.flushAllSyncs(log)

    const ignoreExecRes = await execInPod(["/bin/sh", "-c", "ls -a /tmp /tmp/nested"], log, workload)
    // Clean up the files we created locally
    for (const filename of ["made_locally", "somedir", "prefix-a", "nested"]) {
      try {
        await remove(join(actionPath, filename))
      } catch {}
    }

    expect(ignoreExecRes.output.trim()).to.eql(dedent`
      /tmp:
      .
      ..
      Dockerfile
      garden.yml
      made_locally
      nested

      /tmp/nested:
      .
      ..
    `)
  })

  describe("convertKubernetesModuleDevModeSpec", () => {
    it("should return a simple sync spec converted from a kubernetes or helm module", async () => {
      // Since the sync specs for both `kubernetes` and `helm` modules have the type
      // `KubernetesModuleDevModeSpec`, we don't need separate test cases for each of those two module types here.

      garden.setModuleConfigs([
        <KubernetesModuleConfig>{
          kind: "Module",
          type: "kubernetes",
          name: "foo",
          path: garden.projectRoot,
          spec: {
            sync: {
              paths: [
                {
                  target: "/app/src",
                  source: "src",
                  mode: "two-way",
                },
              ],
            },
            serviceResource: {
              kind: "Deployment",
              name: "some-deployment",
            },
          },
        },
      ])

      graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
      const module = graph.getModule("foo")
      const service = graph.moduleGraph.getService("foo")

      const converted = convertKubernetesModuleDevModeSpec(module, service, undefined)

      expect(converted).to.eql({
        paths: [
          {
            target: {
              kind: "Deployment",
              name: "some-deployment",
              containerName: undefined,
              podSelector: undefined,
            },
            mode: "two-way",
            sourcePath: join(module.path, "src"),
            containerPath: "/app/src",
            defaultDirectoryMode: 0o755,
            defaultFileMode: 0o644,
          },
        ],
      })
    })

    it("should return a sync spec using several options converted from a kubernetes or helm module", async () => {
      garden.setModuleConfigs([
        <HelmModuleConfig>{
          kind: "Module",
          type: "helm",
          name: "foo",
          path: garden.projectRoot,
          spec: {
            sync: {
              paths: [
                {
                  target: "/app/src",
                  source: "src",
                  mode: "two-way",
                  exclude: ["bad/things"],
                  defaultFileMode: 0o600,
                  defaultDirectoryMode: 0o700,
                  defaultOwner: "some-user",
                  defaultGroup: "some-group",
                },
              ],
              containerName: "app",
              args: ["arg1", "arg2"],
              command: ["cmd"],
            },
            serviceResource: {
              kind: "Deployment",
              name: "some-deployment",
            },
          },
        },
      ])

      graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
      const module = graph.getModule("foo")
      const service = graph.moduleGraph.getService("foo")

      const converted = convertKubernetesModuleDevModeSpec(module, service, undefined)

      expect(converted).to.eql({
        paths: [
          {
            target: {
              kind: "Deployment",
              name: "some-deployment",
              containerName: undefined,
              podSelector: undefined,
            },
            mode: "two-way",
            exclude: ["bad/things"],
            defaultFileMode: 0o600,
            defaultDirectoryMode: 0o700,
            defaultOwner: "some-user",
            defaultGroup: "some-group",
            sourcePath: join(module.path, "src"),
            containerPath: "/app/src",
          },
        ],
        overrides: [
          {
            target: {
              kind: "Deployment",
              name: "some-deployment",
              containerName: undefined,
              podSelector: undefined,
            },
            command: ["cmd"],
            args: ["arg1", "arg2"],
          },
        ],
      })
    })
  })

  describe("convertContainerDevModeSpec", () => {
    it("converts a sync spec from a container Deploy action", async () => {
      garden.setModuleConfigs([])
      garden.setActionConfigs([
        <ContainerDeployActionConfig>{
          kind: "Deploy",
          type: "container",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
          },
          spec: {
            image: "foo",
            sync: {
              paths: [
                {
                  target: "/app/src",
                  source: "src",
                  mode: "two-way",
                },
              ],
            },
          },
        },
      ])

      graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
      const action = await resolveAction({
        garden,
        graph,
        action: graph.getDeploy("foo"),
        log: garden.log,
      })

      const converted = convertContainerSyncSpec(ctx, action)

      expect(converted).to.eql({
        paths: [
          {
            target: {
              kind: "Deployment",
              name: "foo",
            },
            mode: "two-way",
            defaultDirectoryMode: 0o755,
            defaultFileMode: 0o644,
            sourcePath: join(action.basePath(), "src"),
            containerPath: "/app/src",
          },
        ],
      })
    })
  })
})
