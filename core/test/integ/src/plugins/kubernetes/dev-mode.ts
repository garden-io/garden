/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { LogEntry } from "../../../../../src/logger/log-entry"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import { flushAllMutagenSyncs, killSyncDaemon } from "../../../../../src/plugins/kubernetes/mutagen"
import { KubernetesWorkload } from "../../../../../src/plugins/kubernetes/types"
import { execInWorkload } from "../../../../../src/plugins/kubernetes/util"
import { dedent } from "../../../../../src/util/string"
import { sleep } from "../../../../../src/util/util"
import { getContainerTestGarden } from "./container/container"
import {
  convertContainerDevModeSpec,
  convertKubernetesModuleDevModeSpec,
} from "../../../../../src/plugins/kubernetes/dev-mode"
import { HelmModuleConfig } from "../../../../../src/plugins/kubernetes/helm/module-config"
import { KubernetesModuleConfig } from "../../../../../src/plugins/kubernetes/kubernetes-type/module-config"
import { TestGarden } from "../../../../helpers"
import { ContainerDeployActionConfig } from "../../../../../src/plugins/container/moduleConfig"
import { resolveAction } from "../../../../../src/graph/actions"

describe("dev mode deployments and sync behavior", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider

  const execInPod = async (command: string[], log: LogEntry, workload: KubernetesWorkload) => {
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
      await garden.close()
      await killSyncDaemon(true)
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
  }

  it("should deploy a service in dev mode and successfully set a two-way sync", async () => {
    await init("local")
    const action = graph.getDeploy("dev-mode")
    const log = garden.log
    // const deployTask = new DeployTask({
    //   garden,
    //   graph,
    //   log,
    //   action,
    //   force: true,
    //
    //   devModeDeployNames: [action.name],
    //   localModeDeployNames: [],
    // })

    // await garden.processTasks({ tasks: [deployTask], throwOnError: true })
    const resolvedAction = await garden.resolveAction({
      action,
      log: garden.log,
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })
    const status = await k8sGetContainerDeployStatus({
      ctx,
      action: resolvedAction,
      log,
      devMode: true,
      localMode: false,
    })
    expect(status.detail?.devMode).to.eql(true)

    const workload = status.detail?.detail.workload!

    // First, we create a file locally and verify that it gets synced into the pod
    await writeFile(join(module.path, "made_locally"), "foo")
    await sleep(300)
    const execRes = await execInPod(["/bin/sh", "-c", "cat /tmp/made_locally"], log, workload)
    expect(execRes.output.trim()).to.eql("foo")

    // Then, we create a file in the pod and verify that it gets synced back
    await execInPod(["/bin/sh", "-c", "echo bar > /tmp/made_in_pod"], log, workload)
    await sleep(500)
    const localPath = join(module.path, "made_in_pod")
    expect(await pathExists(localPath)).to.eql(true)
    expect((await readFile(localPath)).toString().trim()).to.eql("bar")

    // This is to make sure that the two-way sync doesn't recreate the local files we're about to delete here.
    const actions = await garden.getActionRouter()
    await actions.deploy.delete({ graph, log: garden.log, action: resolvedAction })

    // Clean up the files we created locally
    for (const filename of ["made_locally", "made_in_pod"]) {
      try {
        await remove(join(module.path, filename))
      } catch {}
    }
  })

  it("should apply ignore rules from the sync spec and the provider-level dev mode defaults", async () => {
    await init("local")
    const action = graph.getDeploy("dev-mode")

    // We want to ignore the following directories (all at module root)
    // somedir
    // prefix-a         <--- matched by provider-level default excludes
    // nested/prefix-b  <--- matched by provider-level default excludes

    action.getConfig().spec.devMode!.sync[0].mode = "one-way-replica"
    action.getConfig().spec.devMode!.sync[0].exclude = ["somedir"]
    const log = garden.log
    // const deployTask = new DeployTask({
    //   garden,
    //   graph,
    //   log,
    //   action,
    //   force: true,
    //
    //   devModeDeployNames: [action.name],
    //   localModeDeployNames: [],
    // })

    // await garden.processTasks({ tasks: [deployTask], throwOnError: true })
    const resolvedAction = await garden.resolveAction({
      action,
      log: garden.log,
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })
    const status = await k8sGetContainerDeployStatus({
      ctx,
      action: resolvedAction,
      log,
      devMode: true,
      localMode: false,
    })

    const workload = status.detail?.detail.workload!

    // First, we create a non-ignored file locally
    await writeFile(join(module.path, "made_locally"), "foo")

    // Then, we create files in each of the directories we intended to ignore in the `exclude` spec above, and
    // verify that they didn't get synced into the pod.
    await mkdirp(join(module.path, "somedir"))
    await writeFile(join(module.path, "somedir", "file"), "foo")
    await mkdirp(join(module.path, "prefix-a"))
    await writeFile(join(module.path, "prefix-a", "file"), "foo")
    await mkdirp(join(module.path, "nested", "prefix-b"))
    await writeFile(join(module.path, "nested", "prefix-b", "file"), "foo")

    await sleep(1000)
    await flushAllMutagenSyncs(ctx, log)

    const ignoreExecRes = await execInPod(["/bin/sh", "-c", "ls -a /tmp /tmp/nested"], log, workload)
    // Clean up the files we created locally
    for (const filename of ["made_locally", "somedir", "prefix-a", "nested"]) {
      try {
        await remove(join(module.path, filename))
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
    it("should return a simple dev mode spec converted from a kubernetes or helm module", async () => {
      // Since the dev mode specs for both `kubernetes` and `helm` modules have the type
      // `KubernetesModuleDevModeSpec`, we don't need separate test cases for each of those two module types here.

      garden.setModuleConfigs([
        <KubernetesModuleConfig>{
          kind: "Module",
          type: "kubernetes",
          name: "foo",
          path: garden.projectRoot,
          spec: {
            devMode: {
              sync: [
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
        syncs: [
          {
            target: {
              kind: "Deployment",
              name: "some-deployment",
            },
            mode: "two-way",
            sourcePath: join(module.path, "src"),
            containerPath: "/app/src",
          },
        ],
      })
    })

    it("should return a dev mode spec using several options converted from a kubernetes or helm module", async () => {
      garden.setModuleConfigs([
        <HelmModuleConfig>{
          kind: "Module",
          type: "helm",
          name: "foo",
          path: garden.projectRoot,
          spec: {
            devMode: {
              sync: [
                {
                  target: "/app/src",
                  source: "src",
                  mode: "two-way",
                  exclude: ["bad/things"],
                  defaultFileMode: 600,
                  defaultDirectoryMode: 700,
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
        syncs: [
          {
            target: {
              kind: "Deployment",
              name: "some-deployment",
            },
            mode: "two-way",
            exclude: ["bad/things"],
            defaultFileMode: 600,
            defaultDirectoryMode: 700,
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
            },
            command: ["cmd"],
            args: ["arg1", "arg2"],
          },
        ],
      })
    })
  })

  describe("convertContainerDevModeSpec", () => {
    it("converts a dev mode spec from a container Deploy action", async () => {
      garden.setActionConfigs([
        <ContainerDeployActionConfig>{
          kind: "Deploy",
          type: "container",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
          },
          spec: {
            devMode: {
              sync: [
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

      const converted = convertContainerDevModeSpec(ctx, action)

      expect(converted).to.eql({
        syncs: [
          {
            target: {
              kind: "Deployment",
              name: "foo",
            },
            mode: "one-way-safe",
            sourcePath: join(action.basePath(), "src"),
            containerPath: "/app/src",
          },
        ],
      })
    })
  })
})
