/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import type { PluginContext } from "../../../../../../src/plugin-context.js"
import type { KubernetesDeployActionSpecFileSources } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common.js"
import { getManifests, readManifests } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common.js"
import type { TestGarden } from "../../../../../helpers.js"
import { expectError, getDataDir, getExampleDir, makeTestGarden } from "../../../../../helpers.js"
import type { KubernetesDeployAction } from "../../../../../../src/plugins/kubernetes/kubernetes-type/config.js"
import type { Resolved } from "../../../../../../src/actions/types.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import type { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import dedent from "dedent"
import { dirname, join } from "path"
import { resolveMsg } from "../../../../../../src/logger/log-entry.js"
import type { KubernetesPatchResource } from "../../../../../../src/plugins/kubernetes/types.js"
import { type KubernetesResource } from "../../../../../../src/plugins/kubernetes/types.js"

export async function getKubernetesTestGarden() {
  const projectRoot = getDataDir("test-projects", "kubernetes-type")
  const garden = await makeTestGarden(projectRoot)

  return garden
}

describe("getManifests", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let graph: ConfigGraph
  let api: KubeApi
  const defaultNamespace = "foobar"

  context("legacyAllowPartial", () => {
    let action: Resolved<KubernetesDeployAction>

    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider({
        log: garden.log,
        name: "local-kubernetes",
      })) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({
        log: garden.log,
        emit: false,
      })
    })

    it("crashes with yaml syntax error if an if block references variable that does not exist", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("legacypartial-ifblock-doesnotexist"),
        log: garden.log,
        graph,
      })

      await expectError(() => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }), {
        contains: ["could not parse ifblock-doesnotexist.yaml in directory ", "as valid yaml"],
      })
    })

    it("should not crash due to indentation with if block statement", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("legacypartial-ifblock-indentation"),
        log: garden.log,
        graph,
      })

      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      expect(result.length).to.eq(2) // due to metadata configmap
    })

    it("partially resolves the consequent branch of ${if true} block", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("legacypartial-ifblock-true"),
        log: garden.log,
        graph,
      })

      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      expect(result.length).to.eq(2) // due to metadata configmap
      expect(result[0].metadata.name).to.eq("it-partially-resolves-${var.doesNotExist}-and-${unescapes}")
    })

    it("partially resolves the alternate branch of ${if false} block", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("legacypartial-ifblock-false"),
        log: garden.log,
        graph,
      })

      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      expect(result.length).to.eq(2) // due to metadata configmap
      expect(result[0].metadata.name).to.eq("it-partially-resolves-${var.doesNotExist}-and-${unescapes}")
    })
  })

  context("duplicates", () => {
    let action: Resolved<KubernetesDeployAction>

    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider({
        log: garden.log,
        name: "local-kubernetes",
      })) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    it("finds duplicates in manifests declared inline", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("duplicates-inline"),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 1)
            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 0)
            `)
        }
      )
    })

    it("finds duplicates between manifests declared both inline and using kustomize", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("duplicates-inline-kustomize"),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo generated by Kustomize at path ${join(
              dirname(action.configPath()!),
              "/k8s"
            )} (index: 0)
            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 0)
            `)
        }
      )
    })

    it("finds duplicates between manifests declared both inline and in files", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("duplicates-files-inline"),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo declared in the file ${join(
              dirname(action.configPath()!),
              "/k8s/manifest.yaml"
            )} (index: 0)
            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 0)
            `)
        }
      )
    })

    it("finds duplicates between manifests declared both using kustomize and in files", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("duplicates-files-kustomize"),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo generated by Kustomize at path ${join(
              dirname(action.configPath()!),
              "/k8s"
            )} (index: 0)
            - Service silly-demo declared in the file ${join(
              dirname(action.configPath()!),
              "/k8s/manifest.yaml"
            )} (index: 0)
            `)
        }
      )
    })
  })

  context("kustomize", () => {
    const exampleDir = getExampleDir("kustomize")

    let action: Resolved<KubernetesDeployAction>

    before(async () => {
      garden = await makeTestGarden(exampleDir)
      const provider = (await garden.resolveProvider({
        log: garden.log,
        name: "local-kubernetes",
      })) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: graph.getDeploy("hello-world"),
        log: garden.log,
        graph,
      })
    })

    const expectedErr = "kustomize.extraArgs must not include any of -o, --output, -h, --help"

    it("throws if --output is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--output", "foo"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if -o is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["-o", "foo"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if -h is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["-h"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if --help is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--help"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.include(expectedErr)
        }
      )
    })

    it("runs kustomize build in the given path", async () => {
      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      const kinds = result.map((r) => r.kind)
      // the last ConfigMap stands for internal metadata ConfigMap
      expect(kinds).to.have.members(["ConfigMap", "Service", "Deployment", "ConfigMap"])
    })

    it("adds extraArgs if specified to the build command", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--reorder", "none"]
      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      const kinds = result.map((r) => r.kind)
      // the last ConfigMap stands for internal metadata ConfigMap
      expect(kinds).to.eql(["Deployment", "Service", "ConfigMap", "ConfigMap"])
    })
  })

  context("kubernetes manifest files resolution", () => {
    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider({
        log: garden.log,
        name: "local-kubernetes",
      })) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    type TestCaseConfig = { actionName: string; manifestSourceFieldName: keyof KubernetesDeployActionSpecFileSources }
    const testCaseConfigs: TestCaseConfig[] = [
      {
        actionName: "with-build-action",
        manifestSourceFieldName: "manifestTemplates",
      },
      {
        actionName: "with-build-action-manifests-in-deprecated-files",
        manifestSourceFieldName: "files",
      },
      {
        actionName: "with-build-action-manifests-in-manifest-files",
        manifestSourceFieldName: "manifestFiles",
      },
    ]

    for (const testCaseConfig of testCaseConfigs) {
      const { actionName, manifestSourceFieldName } = testCaseConfig
      context(`with manifests defined in spec.${manifestSourceFieldName}`, () => {
        it("should support regular files paths", async () => {
          const executedAction = await garden.executeAction<KubernetesDeployAction>({
            action: graph.getDeploy(actionName),
            log: garden.log,
            graph,
          })
          // Pre-check to ensure that the test project has a correct default glob file pattern.
          expect(executedAction.getSpec()[manifestSourceFieldName]).to.eql(["*.yaml"])

          const manifests = await getManifests({ ctx, api, action: executedAction, log: garden.log, defaultNamespace })
          expect(manifests).to.exist
          const names = manifests.map((m) => ({ kind: m.kind, name: m.metadata?.name }))
          // Now `getManifests` also returns a ConfigMap with internal metadata
          expect(names).to.eql([
            { kind: "Deployment", name: "busybox-deployment" },
            {
              kind: "ConfigMap",
              name: `garden-meta-deploy-${actionName}`,
            },
          ])
        })

        it("should support both regular paths and glob patterns with deduplication", async () => {
          const action = graph.getDeploy(actionName) as KubernetesDeployAction
          // Append a valid filename that results to the default glob pattern '*.yaml'.
          action["_config"]["spec"][manifestSourceFieldName].push("deployment.yaml")
          const executedAction = await garden.resolveAction<KubernetesDeployAction>({
            action,
            log: garden.log,
            graph,
          })
          // Pre-check to ensure that the list of files in the test project config is correct.
          expect(executedAction.getSpec()[manifestSourceFieldName]).to.eql(["*.yaml", "deployment.yaml"])

          const manifests = await getManifests({ ctx, api, action: executedAction, log: garden.log, defaultNamespace })
          expect(manifests).to.exist
          const names = manifests.map((m) => ({ kind: m.kind, name: m.metadata?.name }))
          // Now `getManifests` also returns a ConfigMap with internal metadata
          expect(names).to.eql([
            { kind: "Deployment", name: "busybox-deployment" },
            {
              kind: "ConfigMap",
              name: `garden-meta-deploy-${actionName}`,
            },
          ])
        })

        it("should throw on missing regular path", async () => {
          const action = graph.getDeploy(actionName) as KubernetesDeployAction
          action["_config"]["spec"][manifestSourceFieldName].push("missing-file.yaml")
          const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
            action,
            log: garden.log,
            graph,
          })

          await expectError(
            () =>
              getManifests({
                ctx,
                api,
                action: resolvedAction,
                log: garden.log,
                defaultNamespace,
              }),
            {
              contains: `Invalid manifest file path(s) declared in ${action.longDescription()}`,
            }
          )
        })

        it("should throw when no files found from glob pattens", async () => {
          const action = graph.getDeploy(actionName) as KubernetesDeployAction
          // Rewrite the whole files array to have a glob pattern that results to an empty list of files.
          action["_config"]["spec"][manifestSourceFieldName] = ["./**/manifests/*.yaml"]
          const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
            action,
            log: garden.log,
            graph,
          })

          await expectError(
            () =>
              getManifests({
                ctx,
                api,
                action: resolvedAction,
                log: garden.log,
                defaultNamespace,
              }),
            {
              contains: `Invalid manifest file path(s) declared in ${action.longDescription()}`,
            }
          )
        })
      })
    }
  })

  context("resource patches", () => {
    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider({
        log: garden.log,
        name: "local-kubernetes",
      })) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    function patchAction({
      action,
      patchResources,
      manifests,
    }: {
      action: KubernetesDeployAction
      patchResources: KubernetesPatchResource[]
      manifests?: KubernetesResource[]
    }) {
      const originalSpec = action.getConfig().spec
      const modifiedSpec = {
        ...originalSpec,
        patchResources,
      }
      if (manifests) {
        modifiedSpec.manifests = manifests
      }
      action["_config"]["spec"] = modifiedSpec

      return { originalSpec }
    }

    it("should apply patches to a manifest", async () => {
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
              template: {
                spec: {
                  containers: [
                    {
                      name: "busybox",
                      env: [
                        {
                          name: "PATCH", // <--- This gets appended to the list when using the default 'strategic'
                          // merge strategy
                          value: "patch-val",
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        expect(manifests[0].spec.template.spec.containers[0].env).to.eql([
          {
            name: "PATCH",
            value: "patch-val",
          },
          {
            name: "FOO",
            value: "banana",
          },
          {
            name: "BAR",
            value: "",
          },
          {
            name: "BAZ",
            value: null,
          },
        ])
        expect(manifests[0].spec.replicas).to.eql(3)
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })

    it("should handle multiple patches", async () => {
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
            },
          },
        },
        {
          name: "test-configmap",
          kind: "ConfigMap",
          patch: {
            data: {
              hello: "patched-world",
            },
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        expect(manifests[0].spec.replicas).to.eql(3)
        expect(manifests[1].data.hello).to.eql("patched-world")
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })

    it("should store patched version in metadata ConfigMap", async () => {
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            metadata: {
              namespace: "patched-namespace-deployment",
            },
          },
        },
        {
          name: "test-configmap",
          kind: "ConfigMap",
          patch: {
            metadata: {
              namespace: "patched-namespace-configmap",
            },
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        const metadataConfigMap = manifests.filter((m) => m.metadata.name === "garden-meta-deploy-deploy-action")
        expect(JSON.parse(metadataConfigMap[0].data.manifestMetadata)).to.eql({
          "Deployment/busybox-deployment": {
            apiVersion: "apps/v1",
            key: "Deployment/busybox-deployment",
            kind: "Deployment",
            name: "busybox-deployment",
            namespace: "patched-namespace-deployment", // <--- The patched namespace should be used here
          },
          "ConfigMap/test-configmap": {
            apiVersion: "v1",
            key: "ConfigMap/test-configmap",
            kind: "ConfigMap",
            name: "test-configmap",
            namespace: "patched-namespace-configmap", // <--- The patched namespace should be used here
          },
        })
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })

    it("should apply patches to file and inline manifests", async () => {
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
            },
          },
        },
        {
          name: "test-configmap",
          kind: "ConfigMap",
          patch: {
            data: {
              hello: "patched-world",
            },
          },
        },
        {
          name: "test-configmap-inline",
          kind: "ConfigMap",
          patch: {
            data: {
              hello: "patched-world-inline",
            },
          },
        },
      ] as any
      const manifests = [
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-inline",
          },
          data: {
            hello: "world-inline",
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources, manifests })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        expect(manifests[0].data.hello).to.eql("patched-world-inline")
        expect(manifests[1].spec.replicas).to.eql(3)
        expect(manifests[2].data.hello).to.eql("patched-world")
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })

    it("should apply patches BEFORE post processing manifests", async () => {
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3, // <--- This should be set
            },
            metadata: {
              annotations: {
                "garden.io/service": "patched-service-annotation", // <--- This should not be set
                "garden.io/mode": "patched-mode",
              },
            },
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        expect(manifests[0].spec.replicas).to.eql(3)
        // These annotations are set during manifest post processing and should stay intact
        expect(manifests[0].metadata.annotations).to.eql({
          "garden.io/service": "deploy-action",
          "garden.io/mode": "default",
        })
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })

    it("should allow the user to configure the merge patch strategy", async () => {
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          strategy: "merge",
          patch: {
            spec: {
              replicas: 3,
              template: {
                spec: {
                  containers: [
                    {
                      name: "busybox",
                      env: [
                        {
                          name: "PATCH", // <--- This overwrites the list when using the 'merge' strategy
                          value: "patch-val",
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        // Existing env values get replaced when using the 'merge' strategy
        expect(manifests[0].spec.template.spec.containers[0].env).to.eql([
          {
            name: "PATCH",
            value: "patch-val",
          },
        ])
        expect(manifests[0].spec.replicas).to.eql(3)
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })

    it("should log a warning if patches don't match manifests", async () => {
      garden.log.root["entries"].length = 0
      const action = graph.getDeploy("deploy-action")
      const patchResources = [
        {
          name: "non-existent-resource",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
            },
          },
        },
      ] as any

      const { originalSpec } = patchAction({ action, patchResources })

      try {
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

        const logEntries = garden.log.root.getLogEntries()
        const unMatched = resolveMsg(logEntries.find((entry) => resolveMsg(entry)?.includes("A patch is defined"))!)

        expect(unMatched).to.exist
        expect(unMatched).to.eql(
          `A patch is defined for a Kubernetes Deployment with name non-existent-resource but no Kubernetes resource with a corresponding kind and name found.`
        )
      } finally {
        action["_config"]["spec"] = originalSpec
      }
    })
  })
})

describe("readManifests", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let graph: ConfigGraph

  before(async () => {
    garden = await getKubernetesTestGarden()
    const provider = (await garden.resolveProvider({
      log: garden.log,
      name: "local-kubernetes",
    })) as KubernetesProvider
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  context("with mixed manifest sources", () => {
    it("should read manifests from both spec.manifestFiles and spec.manifestTemplates", async () => {
      const actionName = "with-manifest-templates-and-manifest-files"
      const deployAction = graph.getDeploy(actionName)
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action: deployAction,
        log: garden.log,
        graph,
      })

      const declaredManifests = await readManifests(ctx, resolvedAction, garden.log)
      expect(declaredManifests).to.exist

      const manifests = declaredManifests.map((dm) => dm.manifest)
      expect(manifests).to.exist

      manifests.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
      expect(manifests).to.eql([
        {
          apiVersion: "v1",
          data: {
            hello: "world", // <-- resolve template strings for manifests defined in spec.manifestTemplates
          },
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-1",
          },
        },
        {
          apiVersion: "v1",
          data: {
            hello: "${var.greeting}", // <-- do NOT resolve template strings for manifests defined in spec.manifestFiles
          },
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-2",
          },
        },
      ])
    })

    it("should read manifests from both spec.files and spec.manifestFiles", async () => {
      const actionName = "with-legacy-files-and-manifest-files"
      const deployAction = graph.getDeploy(actionName)
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action: deployAction,
        log: garden.log,
        graph,
      })

      const declaredManifests = await readManifests(ctx, resolvedAction, garden.log)
      expect(declaredManifests).to.exist

      const manifests = declaredManifests.map((dm) => dm.manifest)
      expect(manifests).to.exist

      manifests.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
      expect(manifests).to.eql([
        {
          apiVersion: "v1",
          data: {
            hello: "world", // <-- resolve template strings for manifests defined in deprecated spec.files
          },
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-1",
          },
        },
        {
          apiVersion: "v1",
          data: {
            hello: "${var.greeting}", // <-- do NOT resolve template strings for manifests defined in spec.manifestFiles
          },
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-2",
          },
        },
      ])
    })

    it("should read manifests from both spec.files and spec.manifestTemplates", async () => {
      const actionName = "with-manifest-templates-and-legacy-files"
      const deployAction = graph.getDeploy(actionName)
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action: deployAction,
        log: garden.log,
        graph,
      })

      const declaredManifests = await readManifests(ctx, resolvedAction, garden.log)
      expect(declaredManifests).to.exist

      const manifests = declaredManifests.map((dm) => dm.manifest)
      expect(manifests).to.exist

      manifests.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
      expect(manifests).to.eql([
        {
          apiVersion: "v1",
          data: {
            hello: "world", // <-- resolve template strings for manifests defined in spec.manifestTemplates
          },
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-1",
          },
        },
        {
          apiVersion: "v1",
          data: {
            hello: "world", // <-- resolve template strings for manifests defined in spec.files
          },
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-2",
          },
        },
      ])
    })

    context("with missing references to missing variables in manifest files", () => {
      it("should read manifests from deprecated spec.files and retain original template expression if a referenced variable is not defined (backed by legacyAllowPartial=true)", async () => {
        const actionName = "legacy-files-with-missing-variables"
        const deployAction = graph.getDeploy(actionName)
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action: deployAction,
          log: garden.log,
          graph,
        })

        const declaredManifests = await readManifests(ctx, resolvedAction, garden.log)
        expect(declaredManifests).to.exist

        const manifests = declaredManifests.map((dm) => dm.manifest)
        expect(manifests).to.exist

        manifests.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
        expect(manifests).to.eql([
          {
            apiVersion: "v1",
            data: {
              hello: "${var.missing}", // <-- do NOT resolve template strings for manifests defined in spec.manifestFiles
            },
            kind: "ConfigMap",
            metadata: {
              name: "test-configmap-missing",
            },
          },
        ])
      })

      it("should read manifests from spec.manifestTemplates and retain original template expression if a referenced variable is not defined", async () => {
        const actionName = "manifest-templates-with-missing-variables"
        const deployAction = graph.getDeploy(actionName)
        const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
          action: deployAction,
          log: garden.log,
          graph,
        })

        await expectError(() => readManifests(ctx, resolvedAction, garden.log), {
          contains: "Could not find key missing under var. Available keys: greeting.",
        })
      })
    })
  })
})
