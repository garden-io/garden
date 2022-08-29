/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { cloneDeep } from "lodash"
import { resolve } from "path"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { PluginContext } from "../../../../../../src/plugin-context"
import { readManifests } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common"
import { TestGarden, dataDir, makeTestGarden, getExampleDir, expectError } from "../../../../../helpers"
import { KubernetesDeployAction } from "../../../../../../src/plugins/kubernetes/kubernetes-type/config"
import { Resolved } from "../../../../../../src/actions/base"

let kubernetesTestGarden: TestGarden

export async function getKubernetesTestGarden() {
  if (kubernetesTestGarden) {
    return kubernetesTestGarden
  }

  const projectRoot = resolve(dataDir, "test-projects", "kubernetes-module")
  const garden = await makeTestGarden(projectRoot)

  kubernetesTestGarden = garden

  return garden
}

describe("readManifests", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let action: Resolved<KubernetesDeployAction>
  let graph: ConfigGraph

  const exampleDir = getExampleDir("kustomize")

  before(async () => {
    garden = await makeTestGarden(exampleDir)
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    action = await garden.resolveAction<KubernetesDeployAction>({
      action: cloneDeep(graph.getDeploy("hello-world")),
      log: garden.log,
      graph,
    })
  })

  context("kustomize", () => {
    const expectedErr = "kustomize.extraArgs must not include any of -o, --output, -h, --help"

    it("throws if --output is set in extraArgs", async () => {
      action.getSpec().kustomize!.extraArgs = ["--output", "foo"]

      await expectError(
        () => readManifests(ctx, action, garden.log, false),
        (err) => expect(err.message).to.equal(expectedErr)
      )
    })

    it("throws if -o is set in extraArgs", async () => {
      action.getSpec().kustomize!.extraArgs = ["-o", "foo"]

      await expectError(
        () => readManifests(ctx, action, garden.log, false),
        (err) => expect(err.message).to.equal(expectedErr)
      )
    })

    it("throws if -h is set in extraArgs", async () => {
      action.getSpec().kustomize!.extraArgs = ["-h"]

      await expectError(
        () => readManifests(ctx, action, garden.log, false),
        (err) => expect(err.message).to.equal(expectedErr)
      )
    })

    it("throws if --help is set in extraArgs", async () => {
      action.getSpec().kustomize!.extraArgs = ["--help"]

      await expectError(
        () => readManifests(ctx, action, garden.log, false),
        (err) => expect(err.message).to.equal(expectedErr)
      )
    })

    it("runs kustomize build in the given path", async () => {
      const result = await readManifests(ctx, action, garden.log, true)
      const kinds = result.map((r) => r.kind)
      expect(kinds).to.have.members(["ConfigMap", "Service", "Deployment"])
    })

    it("adds extraArgs if specified to the build command", async () => {
      action.getSpec().kustomize!.extraArgs = ["--reorder", "none"]
      const result = await readManifests(ctx, action, garden.log, true)
      const kinds = result.map((r) => r.kind)
      expect(kinds).to.eql(["Deployment", "Service", "ConfigMap"])
    })
  })
})
