import "../../setup"
import { makeTestGarden, getExampleDir } from "../../helpers"
import { Garden } from "../../../src/garden"

describe("openfaas", () => {
  let garden: Garden

  before(async () => {
    const root = getExampleDir("openfaas")
    garden = await makeTestGarden(root)
  })

  after(async () => {
    await garden.close()
  })

  it("should successfully deploy", async () => {
    const actions = await garden.getActionRouter()
    await actions.deployServices({ log: garden.log })
  })
})
