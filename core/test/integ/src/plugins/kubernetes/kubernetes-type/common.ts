/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import cloneDeep from "fast-copy"

import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { PluginContext } from "../../../../../../src/plugin-context"
import { getManifests } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common"
import { expectError, getDataDir, getExampleDir, makeTestGarden, TestGarden } from "../../../../../helpers"
import { KubernetesDeployAction } from "../../../../../../src/plugins/kubernetes/kubernetes-type/config"
import { Resolved } from "../../../../../../src/actions/types"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import dedent from "dedent"
import { dirname, join } from "path"

let kubernetesTestGarden: TestGarden

export async function getKubernetesTestGarden() {
  if (kubernetesTestGarden) {
    return kubernetesTestGarden
  }

  const projectRoot = getDataDir("test-projects", "kubernetes-type")
  const garden = await makeTestGarden(projectRoot)

  kubernetesTestGarden = garden

  return garden
}

describe("getManifests", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let graph: ConfigGraph
  let api: KubeApi
  const defaultNamespace = "foobar"

  context("duplicates", () => {
    let action: Resolved<KubernetesDeployAction>

    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    it("finds duplicates in manifests declared inline", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("duplicates-inline")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
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
        action: cloneDeep(graph.getDeploy("duplicates-inline-kustomize")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
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
        action: cloneDeep(graph.getDeploy("duplicates-files-inline")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
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
        action: cloneDeep(graph.getDeploy("duplicates-files-kustomize")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
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
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("hello-world")),
        log: garden.log,
        graph,
      })
    })

    const expectedErr = "kustomize.extraArgs must not include any of -o, --output, -h, --help"

    it("throws if --output is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--output", "foo"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if -o is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["-o", "foo"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if -h is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["-h"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if --help is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--help"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: false }),
        (err) => {
          expect(err.message).to.include(expectedErr)
        }
      )
    })

    it("runs kustomize build in the given path", async () => {
      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: true })
      const kinds = result.map((r) => r.kind)
      expect(kinds).to.have.members(["ConfigMap", "Service", "Deployment"])
    })

    it("adds extraArgs if specified to the build command", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--reorder", "none"]
      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace, readFromSrcDir: true })
      const kinds = result.map((r) => r.kind)
      expect(kinds).to.eql(["Deployment", "Service", "ConfigMap"])
    })
  })

  context("kubernetes manifest files resolution", () => {
    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = await garden.resolveProvider(garden.log, "local-kubernetes") as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    it("should support regular files paths", async () => {
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("with-build-action")),
        log: garden.log,
        graph,
      })
      // Pre-check to ensure that the test filenames in the test data are correct.
      expect(resolvedAction.getSpec().files).to.eql(["deployment-action.yaml"])

      // We use readFromSrcDir = true here because we just resolve but do not execute any actions.
      // It means that the build directory will not be created.
      const manifests = await getManifests({
        ctx,
        api,
        action: resolvedAction,
        log: garden.log,
        defaultNamespace,
        readFromSrcDir: true,
      })
      expect(manifests).to.exist
      const names = manifests.map((m) => ({ kind: m.kind, name: m.metadata?.name }))
      expect(names).to.eql([{ kind: "Deployment", name: "busybox-deployment" }])
    })

    it("should support both regular paths and glob patterns with deduplication", async () => {
      const action = cloneDeep(graph.getDeploy("with-build-action"))
      // Append a valid glob pattern that results to a non-empty list of files.
      action["_config"]["spec"]["files"].push("*.yaml")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })
      // Pre-check to ensure that the test filenames in the test data are correct.
      expect(resolvedAction.getSpec().files).to.eql(["deployment-action.yaml", "*.yaml"])

      // We use readFromSrcDir = true here because we just resolve but do not execute any actions.
      // It means that the build directory will not be created.
      const manifests = await getManifests({
        ctx,
        api,
        action: resolvedAction,
        log: garden.log,
        defaultNamespace,
        readFromSrcDir: true,
      })
      expect(manifests).to.exist
      const names = manifests.map((m) => ({ kind: m.kind, name: m.metadata?.name }))
      expect(names).to.eql([{ kind: "Deployment", name: "busybox-deployment" }])
    })

    it("should throw on missing regular path", async () => {
      const action = cloneDeep(graph.getDeploy("with-build-action"))
      action["_config"]["spec"]["files"].push("missing-file.yaml")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      // We use readFromSrcDir = true here because we just resolve but do not execute any actions.
      // It means that the build directory will not be created.
      await expectError(
        () =>
          getManifests({
            ctx,
            api,
            action: resolvedAction,
            log: garden.log,
            defaultNamespace,
            readFromSrcDir: true,
          }),
        {
          contains: `Invalid manifest file path(s) declared in ${action.longDescription()}`,
        }
      )
    })

    it("should throw when no files found from glob pattens", async () => {
      const action = cloneDeep(graph.getDeploy("with-build-action"))
      // Rewrite the whole files array to have a glob pattern that results to an empty list of files.
      action["_config"]["spec"]["files"] = ["./**/manifests/*.yaml"]
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      // We use readFromSrcDir = true here because we just resolve but do not execute any actions.
      // It means that the build directory will not be created.
      await expectError(
        () =>
          getManifests({
            ctx,
            api,
            action: resolvedAction,
            log: garden.log,
            defaultNamespace,
            readFromSrcDir: true,
          }),
        {
          contains: `Invalid manifest file path(s) declared in ${action.longDescription()}`,
        }
      )
    })
  })
})
