import { expect } from "chai"

import { TestGarden, expectError } from "../../../../../helpers"
import { getHotReloadSpec } from "../../../../../../src/plugins/kubernetes/helm/hot-reload"
import { deline } from "../../../../../../src/util/string"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { getHelmTestGarden } from "./common"

describe("getHotReloadSpec", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
    graph = await garden.getConfigGraph()
  })

  after(async () => {
    await garden.close()
  })

  it("should retrieve the hot reload spec on the service's source module", async () => {
    const service = await graph.getService("api")
    expect(getHotReloadSpec(service)).to.eql({
      sync: [
        {
          source: "*",
          target: "/app",
        },
      ],
    })
  })

  it("should throw if the module doesn't specify serviceResource.containerModule", async () => {
    const service = await graph.getService("api")
    delete service.module.spec.serviceResource.containerModule
    await expectError(
      () => getHotReloadSpec(service),
      (err) =>
        expect(err.message).to.equal(
          "Module 'api' must specify `serviceResource.containerModule` in order to enable hot-reloading."
        )
    )
  })

  it("should throw if the referenced module is not a container module", async () => {
    const service = await graph.getService("api")
    const otherModule = await graph.getModule("postgres")
    service.sourceModule = otherModule
    await expectError(
      () => getHotReloadSpec(service),
      (err) =>
        expect(err.message).to.equal(deline`
        Module 'api-image', referenced on module 'api' under \`serviceResource.containerModule\`,
        is not a container module. Please specify the appropriate container module that contains
        the sources for the resource.
      `)
    )
  })

  it("should throw if the referenced module is not configured for hot reloading", async () => {
    const service = await graph.getService("api")
    delete service.sourceModule.spec.hotReload
    await expectError(
      () => getHotReloadSpec(service),
      (err) =>
        expect(err.message).to.equal(deline`
        Module 'api-image', referenced on module 'api' under \`serviceResource.containerModule\`,
        is not configured for hot-reloading. Please specify \`hotReload\` on the 'api-image'
        module in order to enable hot-reloading.
      `)
    )
  })
})
