import { ScanCommand } from "../../../../src/commands/scan"
import { withDefaultGlobalOpts, makeTestGardenA } from "../../../helpers"

describe("ScanCommand", () => {
  it(`should successfully scan a test project`, async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new ScanCommand()

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })
  })
})
