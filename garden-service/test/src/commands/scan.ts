import { Garden } from "../../../src/garden"
import { ScanCommand } from "../../../src/commands/scan"
import { getExampleProjects } from "../../helpers"

describe("ScanCommand", () => {
  for (const [name, path] of Object.entries(getExampleProjects())) {
    it(`should successfully scan the ${name} project`, async () => {
      const garden = await Garden.factory(path)
      const log = garden.log.info()
      const command = new ScanCommand()

      await command.action({
        garden,
        log,
        args: {},
        opts: {},
      })
    })
  }
})
