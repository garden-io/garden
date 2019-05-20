import { Garden } from "../../../../src/garden"
import { ScanCommand } from "../../../../src/commands/scan"
import { getExampleProjects, withDefaultGlobalOpts } from "../../../helpers"

describe("ScanCommand", () => {
  for (const [name, path] of Object.entries(getExampleProjects())) {
    it(`should successfully scan the ${name} project`, async () => {
      const garden = await Garden.factory(path)
      const log = garden.log
      const command = new ScanCommand()

      await command.action({
        garden,
        log,
        logFooter: log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })
    })
  }
})
