/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { isEqual } from "lodash"

import { makeDummyGarden, GardenCli } from "../../../../src/cli/cli"
import { getDataDir, TestGarden, makeTestGardenA, enableAnalytics } from "../../../helpers"
import { GARDEN_SERVICE_ROOT } from "../../../../src/constants"
import { join } from "path"
import { Command } from "../../../../src/commands/base"

describe("cli", () => {
  describe("run", () => {
    it("should pass unparsed args to commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({ args }) {
          return { result: { args } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command, cli["program"])

      const { result } = await cli.parse(["test-command", "some", "args"])
      expect(result).to.eql({ args: { _: ["some", "args"] } })
    })

    it("should not parse args after -- and instead pass directly to commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({ args }) {
          return { result: { args } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command, cli["program"])

      const { result } = await cli.parse(["test-command", "--", "-v", "--flag", "arg"])
      expect(result).to.eql({ args: { _: ["-v", "--flag", "arg"] } })
    })

    it("should correctly parse --var flag", async () => {
      class TestCommand extends Command {
        name = "test-command-var"
        help = "halp!"
        noProject = true

        async action({ garden }) {
          return { result: { variables: garden.variables } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command, cli["program"])

      const { result } = await cli.parse(["test-command-var", "--var", 'key-a=value-a,key-b="value with quotes"'])
      expect(result).to.eql({ variables: { "key-a": "value-a", "key-b": "value with quotes" } })
    })

    it(`should configure a dummy environment when command has noProject=true and --env is specified`, async () => {
      class TestCommand2 extends Command {
        name = "test-command-2"
        help = "halp!"
        noProject = true

        async action({ garden }) {
          return { result: { environmentName: garden.environmentName } }
        }
      }

      const command = new TestCommand2()
      const cli = new GardenCli()
      cli.addCommand(command, cli["program"])

      const { result, errors } = await cli.parse(["test-command-2", "--env", "missing-env"], false)
      expect(errors).to.eql([])
      expect(result).to.eql({ environmentName: "missing-env" })
    })

    it("should error if an invalid --env parameter is passed", async () => {
      class TestCommand3 extends Command {
        name = "test-command-3"
        help = "halp!"
        noProject = true

        async action({ garden }) {
          return { result: { environmentName: garden.environmentName } }
        }
      }

      const command = new TestCommand3()
      const cli = new GardenCli()
      cli.addCommand(command, cli["program"])

      const { errors } = await cli.parse(["test-command-3", "--env", "$.%"], false)
      expect(errors.length).to.equal(1)
      expect(errors[0].message).to.equal(
        "Invalid environment specified ($.%): must be a valid environment name or <namespace>.<environment>"
      )
    })

    context("test analytics", () => {
      const host = "https://api.segment.io"
      const scope = nock(host)
      let garden: TestGarden
      let resetAnalyticsConfig: Function

      before(async () => {
        garden = await makeTestGardenA()
        resetAnalyticsConfig = await enableAnalytics(garden)
      })

      after(async () => {
        await resetAnalyticsConfig()
        nock.cleanAll()
      })

      it("should wait for queued analytic events to flush", async () => {
        class TestCommand extends Command {
          name = "test-command"
          help = "hilfe!"
          noProject = true

          async action({ args }) {
            return { result: { args } }
          }
        }

        const command = new TestCommand()
        const cli = new GardenCli()
        cli.addCommand(command, cli["program"])

        scope
          .post(`/v1/batch`, (body) => {
            const events = body.batch.map((event: any) => ({
              event: event.event,
              type: event.type,
              name: event.properties.name,
            }))
            return isEqual(events, [
              {
                event: "Run Command",
                type: "track",
                name: "test-command",
              },
            ])
          })
          .reply(200)
        await cli.parse(["test-command"])

        expect(scope.done()).to.not.throw
      })
    })
  })

  describe("makeDummyGarden", () => {
    it("should initialise and resolve config graph in a directory with no project", async () => {
      const garden = await makeDummyGarden(join(GARDEN_SERVICE_ROOT, "tmp", "foobarbas"), {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with invalid config", async () => {
      const root = getDataDir("test-project-invalid-config")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with template strings", async () => {
      const root = getDataDir("test-project-templated")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(dg.getModules()).to.not.throw
    })
  })
})
