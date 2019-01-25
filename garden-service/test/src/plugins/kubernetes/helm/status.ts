import { resolve } from "path"
import { expect } from "chai"

import { dataDir, makeTestGarden } from "../../../../helpers"
import { getServiceOutputs } from "../../../../../src/plugins/kubernetes/helm/status"

describe("getServiceOutputs", () => {
  it("should output the release name for the chart", async () => {
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext("local-kubernetes")

    const service = await garden.getService("api")
    const module = service.module

    const result = await getServiceOutputs({ ctx, module, service, log: garden.log })

    expect(result).to.eql({ "release-name": "api" })
  })
})
