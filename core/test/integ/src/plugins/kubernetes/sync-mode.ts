/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import fsExtra from "fs-extra"
import { join } from "path"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"
import { k8sGetContainerDeployStatus } from "../../../../../src/plugins/kubernetes/container/status.js"
import type { ActionLog, Log } from "../../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../../src/logger/log-entry.js"
import type {
  KubernetesPluginContext,
  KubernetesProvider,
  KubernetesTargetResourceSyncModeSpec,
} from "../../../../../src/plugins/kubernetes/config.js"
import { getMutagenMonitor, Mutagen } from "../../../../../src/mutagen.js"
import type { KubernetesWorkload, SyncableRuntimeAction } from "../../../../../src/plugins/kubernetes/types.js"
import { execInWorkload } from "../../../../../src/plugins/kubernetes/util.js"
import { dedent } from "../../../../../src/util/string.js"
import { sleep } from "../../../../../src/util/util.js"
import { getContainerTestGarden } from "./container/container.js"
import {
  configureSyncMode,
  convertContainerSyncSpec,
  convertKubernetesModuleDevModeSpec,
} from "../../../../../src/plugins/kubernetes/sync.js"
import type { HelmModuleConfig } from "../../../../../src/plugins/kubernetes/helm/module-config.js"
import type { KubernetesModuleConfig } from "../../../../../src/plugins/kubernetes/kubernetes-type/module-config.js"
import type { TestGarden } from "../../../../helpers.js"
import { cleanProject, expectError, getDataDir, makeTestGarden } from "../../../../helpers.js"
import type { ContainerDeployActionConfig } from "../../../../../src/plugins/container/moduleConfig.js"
import { resolveAction } from "../../../../../src/graph/actions.js"
import { DeployTask } from "../../../../../src/tasks/deploy.js"
import { MUTAGEN_DIR_NAME } from "../../../../../src/constants.js"
import {
  defaultUtilImageRegistryDomain,
  getK8sSyncUtilImagePath,
} from "../../../../../src/plugins/kubernetes/constants.js"
import type { Action, Resolved } from "../../../../../src/actions/types.js"
import stripAnsi from "strip-ansi"

const { mkdirp, pathExists, readFile, remove, writeFile } = fsExtra

describe("sync mode deployments and sync behavior", () => {
  describe("sync mode deployments", () => {
    const environmentName = "local"
    let garden: TestGarden
    let cleanup: (() => void) | undefined
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

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    beforeEach(async () => {
      ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { noTempDir: true }))
      graph = await garden.getConfigGraph({
        log: garden.log,
        emit: false,
        noCache: true,
        actionModes: {
          sync: ["deploy.sync-mode"],
        },
      })
      provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
      ctx = <KubernetesPluginContext>(
        await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      )
    })

    afterEach(async () => {
      if (garden) {
        garden.close()
        const dataDir = join(garden.gardenDirPath, MUTAGEN_DIR_NAME)
        await getMutagenMonitor({ log: garden.log, dataDir }).stop()
        await cleanProject(garden.gardenDirPath)
      }
    })

    // todo: fix this test, It works locally, fails on ci
    it("should deploy a service in sync mode and successfully set a two-way sync", async () => {
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
        graph: await garden.getConfigGraph({
          log: garden.log,
          emit: false,
          actionModes: { sync: ["deploy.sync-mode"] },
        }),
      })
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

      const status = await k8sGetContainerDeployStatus({
        ctx,
        action: resolvedAction,
        log: actionLog,
      })

      expect(status.detail?.mode).to.equal("sync")

      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      const workload = status.detail?.detail.workload!

      // First, we create a file locally and verify that it gets synced into the pod
      const actionPath = action.sourcePath()
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
    it("should apply ignore rules from the sync spec and the provider-level sync defaults", async () => {
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
        graph: await garden.getConfigGraph({
          log: garden.log,
          emit: false,
          actionModes: { sync: ["deploy.sync-mode"] },
        }),
      })
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      const status = await k8sGetContainerDeployStatus({
        ctx,
        action: resolvedAction,
        log: actionLog,
      })

      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      const workload = status.detail?.detail.workload!
      const actionPath = action.sourcePath()

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
  })

  describe("convertKubernetesModuleDevModeSpec", () => {
    const environmentName = "local"
    const root = getDataDir("test-projects", "container")
    let garden: TestGarden
    let graph: ConfigGraph

    beforeEach(async () => {
      garden = await makeTestGarden(root, { environmentString: environmentName, noTempDir: true })
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    afterEach(() => {
      garden.close()
    })

    it("should return a simple sync spec converted from a kubernetes or helm module", async () => {
      // Since the sync specs for both `kubernetes` and `helm` modules have the type
      // `KubernetesModuleDevModeSpec`, we don't need separate test cases for each of those two module types here.

      garden.setPartialModuleConfigs([
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
      garden.setPartialModuleConfigs([
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
    const environmentName = "local"
    const root = getDataDir("test-projects", "container")
    let garden: TestGarden
    let graph: ConfigGraph
    let ctx: KubernetesPluginContext
    let provider: KubernetesProvider

    beforeEach(async () => {
      garden = await makeTestGarden(root, { environmentString: environmentName, noTempDir: true })
      provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
      ctx = <KubernetesPluginContext>(
        await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      )
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    afterEach(() => {
      garden.close()
    })

    it("converts a sync spec from a container Deploy action", async () => {
      garden.setPartialModuleConfigs([])
      garden.setPartialActionConfigs([
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
            sourcePath: join(action.sourcePath(), "src"),
            containerPath: "/app/src",
          },
        ],
      })
    })
  })

  describe("configureSyncMode", () => {
    const environmentName = "local"
    const root = getDataDir("test-projects", "container")
    let garden: TestGarden
    let graph: ConfigGraph
    let ctx: KubernetesPluginContext
    let provider: KubernetesProvider
    let actionRaw: Action
    let actionLog: ActionLog
    let action: Resolved<SyncableRuntimeAction>

    // It's enough to initialise this once for the tests in this block
    before(async () => {
      garden = await makeTestGarden(root, { environmentString: environmentName, noTempDir: true })
      provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
      ctx = <KubernetesPluginContext>(
        await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      )
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      actionRaw = graph.getDeploy("sync-mode")
      actionLog = createActionLog({ log: garden.log, actionName: actionRaw.name, actionKind: actionRaw.kind })
      action = await garden.resolveAction({
        action: actionRaw,
        log: garden.log,
        graph: await garden.getConfigGraph({
          log: garden.log,
          emit: false,
          actionModes: { sync: ["deploy.sync-mode"] },
        }),
      })
    })

    it("should return all manifests with the target resources modified and the updated resource itself", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: {
            name: "sync-mode",
          },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
        {
          kind: "ConfigMap",
          apiVersion: "v1",
          metadata: {
            name: "my-configmap",
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider,
        action,
        manifests,
        defaultTarget: undefined,
        spec: {
          paths: [
            {
              target: {
                kind: "Deployment",
                name: "sync-mode",
              },
              sourcePath: join(action.sourcePath(), "src"),
              containerPath: "/app/src",
            },
          ],
        },
      })

      expect(res).to.eql({
        updated: [
          {
            kind: "Deployment",
            apiVersion: "apps/v1",
            metadata: {
              name: "sync-mode",
              annotations: {
                "garden.io/mode": "sync",
              },
            },
            spec: {
              template: {
                spec: {
                  containers: [
                    {
                      name: "sync-mode",
                      volumeMounts: [
                        {
                          name: "garden",
                          mountPath: "/.garden",
                        },
                      ],
                    },
                  ],
                  volumes: [
                    {
                      name: "garden",
                      emptyDir: {},
                    },
                  ],
                  initContainers: [
                    {
                      name: "garden-sync-init",
                      image: getK8sSyncUtilImagePath(defaultUtilImageRegistryDomain),
                      command: ["/bin/sh", "-c", "'cp' '/usr/local/bin/mutagen-agent' '/.garden/mutagen-agent'"],
                      imagePullPolicy: "IfNotPresent",
                      volumeMounts: [
                        {
                          name: "garden",
                          mountPath: "/.garden",
                        },
                      ],
                    },
                  ],
                  imagePullSecrets: [],
                },
              },
            },
          },
        ],
        manifests: [
          {
            kind: "Deployment",
            apiVersion: "apps/v1",
            metadata: {
              name: "sync-mode",
              annotations: {
                "garden.io/mode": "sync",
              },
            },
            spec: {
              template: {
                spec: {
                  containers: [
                    {
                      name: "sync-mode",
                      volumeMounts: [
                        {
                          name: "garden",
                          mountPath: "/.garden",
                        },
                      ],
                    },
                  ],
                  volumes: [
                    {
                      name: "garden",
                      emptyDir: {},
                    },
                  ],
                  initContainers: [
                    {
                      name: "garden-sync-init",
                      image: getK8sSyncUtilImagePath(defaultUtilImageRegistryDomain),
                      command: ["/bin/sh", "-c", "'cp' '/usr/local/bin/mutagen-agent' '/.garden/mutagen-agent'"],
                      imagePullPolicy: "IfNotPresent",
                      volumeMounts: [
                        {
                          name: "garden",
                          mountPath: "/.garden",
                        },
                      ],
                    },
                  ],
                  imagePullSecrets: [],
                },
              },
            },
          },
          {
            kind: "ConfigMap",
            apiVersion: "v1",
            metadata: {
              name: "my-configmap",
            },
          },
        ],
      })
    })
    it("should correctly set image pull secrets from the provider config on the Pod spec", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: {
            name: "sync-mode",
          },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider: {
          ...provider,
          config: {
            ...provider.config,
            imagePullSecrets: [
              {
                name: "secret-a",
                namespace: "the-secret-namespace",
              },
              {
                name: "secret-b",
                namespace: "the-secret-namespace",
              },
            ],
          },
        },
        action,
        manifests,
        defaultTarget: undefined,
        spec: {
          paths: [
            {
              target: {
                kind: "Deployment",
                name: "sync-mode",
              },
              sourcePath: join(action.sourcePath(), "src"),
              containerPath: "/app/src",
            },
          ],
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.updated[0]).spec.template.spec.imagePullSecrets).to.eql([
        {
          name: "secret-a",
        },
        {
          name: "secret-b",
        },
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.manifests[0]).spec.template.spec.imagePullSecrets).to.eql([
        {
          name: "secret-a",
        },
        {
          name: "secret-b",
        },
      ])
    })
    it("should not overwrite existing image pull secrets", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: {
            name: "sync-mode",
          },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
                imagePullSecrets: [
                  {
                    name: "deployment-secret",
                  },
                ],
              },
            },
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider: {
          ...provider,
          config: {
            ...provider.config,
            imagePullSecrets: [
              {
                name: "provider-secret",
                namespace: "the-secret-namespace",
              },
            ],
          },
        },
        action,
        manifests,
        defaultTarget: undefined,
        spec: {
          paths: [
            {
              target: {
                kind: "Deployment",
                name: "sync-mode",
              },
              sourcePath: join(action.sourcePath(), "src"),
              containerPath: "/app/src",
            },
          ],
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.updated[0]).spec.template.spec.imagePullSecrets).to.eql([
        {
          name: "deployment-secret",
        },
        {
          name: "provider-secret",
        },
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.manifests[0]).spec.template.spec.imagePullSecrets).to.eql([
        {
          name: "deployment-secret",
        },
        {
          name: "provider-secret",
        },
      ])
    })
    it("should handle overrides without a target when defaultTarget is provided", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode" },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode", image: "original-image" }],
              },
            },
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider,
        action,
        manifests,
        defaultTarget: { kind: "Deployment", name: "sync-mode" },
        spec: {
          overrides: [
            {
              image: "new-image",
            },
          ],
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.updated[0]).spec.template.spec.containers[0].image).to.equal("new-image")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.manifests[0]).spec.template.spec.containers[0].image).to.equal("new-image")
    })
    it("should throw an error when override has no target and no defaultTarget", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode" },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
      ]

      await expectError(
        async () =>
          await configureSyncMode({
            ctx,
            log: actionLog,
            provider,
            action,
            manifests,
            defaultTarget: undefined,
            spec: {
              overrides: [
                {
                  image: "new-image",
                },
              ],
            },
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.contain(
            stripAnsi(`Sync override configuration on ${action.longDescription()} doesn't specify a target`)
          )
      )
    })
    it("should handle sync paths with podSelector", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode" },
          spec: {
            selector: { matchLabels: { app: "sync-mode" } },
            template: {
              metadata: { labels: { app: "sync-mode" } },
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
      ]

      const target: KubernetesTargetResourceSyncModeSpec = { podSelector: { app: "sync-mode" } }
      await expectError(
        () =>
          configureSyncMode({
            ctx,
            log: actionLog,
            provider,
            action,
            manifests,
            defaultTarget: undefined,
            spec: {
              paths: [
                {
                  target,
                  sourcePath: join(action.sourcePath(), "src"),
                  containerPath: "/app/src",
                },
              ],
            },
          }),
        {
          contains: [
            "doesn't specify a target, and none is set as a default",
            "Either specify a target via the spec.sync.paths[].target or spec.defaultTarget",
            "The target must be configured via a pair of kind and name fields either in the spec.sync.paths[].target or spec.defaultTarget",
          ],
        }
      )
    })
    it("should throw an error when sync path has no target and no defaultTarget", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode" },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
      ]

      await expectError(
        async () =>
          configureSyncMode({
            ctx,
            log: actionLog,
            provider,
            action,
            manifests,
            defaultTarget: undefined,
            spec: {
              paths: [
                {
                  sourcePath: join(action.sourcePath(), "src"),
                  containerPath: "/app/src",
                },
              ],
            },
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.contain(
            stripAnsi(`Sync path configuration on ${action.longDescription()} doesn't specify a target`)
          )
      )
    })
    it("should handle overrides with command and args", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode" },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider,
        action,
        manifests,
        defaultTarget: { kind: "Deployment", name: "sync-mode" },
        spec: {
          overrides: [
            {
              command: ["npm", "start"],
              args: ["--port", "8080"],
            },
          ],
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const container = (<any>res.updated[0]).spec.template.spec.containers[0]
      expect(container.command).to.deep.equal(["npm", "start"])
      expect(container.args).to.deep.equal(["--port", "8080"])
    })
    it("should handle multiple targets and overrides", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode-1" },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode-1" }],
              },
            },
          },
        },
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: { name: "sync-mode-2" },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode-2" }],
              },
            },
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider,
        action,
        manifests,
        defaultTarget: undefined,
        spec: {
          overrides: [
            {
              target: { kind: "Deployment", name: "sync-mode-1" },
              image: "new-image-1",
            },
            {
              target: { kind: "Deployment", name: "sync-mode-2" },
              image: "new-image-2",
            },
          ],
        },
      })

      expect(res.updated).to.have.length(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.updated[0]).spec.template.spec.containers[0].image).to.equal("new-image-1")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.updated[1]).spec.template.spec.containers[0].image).to.equal("new-image-2")
    })
    it("should use a custom container domain for the sync util image if configured that way", async () => {
      const manifests = [
        {
          kind: "Deployment",
          apiVersion: "apps/v1",
          metadata: {
            name: "sync-mode",
          },
          spec: {
            template: {
              spec: {
                containers: [{ name: "sync-mode" }],
              },
            },
          },
        },
      ]

      const res = await configureSyncMode({
        ctx,
        log: actionLog,
        provider: {
          ...provider,
          config: {
            ...provider.config,
            utilImageRegistryDomain: "https://my-custom-registry-mirror.io",
          },
        },
        action,
        manifests,
        defaultTarget: undefined,
        spec: {
          paths: [
            {
              target: {
                kind: "Deployment",
                name: "sync-mode",
              },
              sourcePath: join(action.sourcePath(), "src"),
              containerPath: "/app/src",
            },
          ],
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.updated[0]).spec.template.spec.initContainers[0].image).to.eql(
        getK8sSyncUtilImagePath("https://my-custom-registry-mirror.io")
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((<any>res.manifests[0]).spec.template.spec.initContainers[0].image).to.eql(
        getK8sSyncUtilImagePath("https://my-custom-registry-mirror.io")
      )
    })
  })
})
