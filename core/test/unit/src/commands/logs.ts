/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { expect } from "chai"
import { Garden } from "../../../../src"
import { LogsCommand } from "../../../../src/commands/logs"
import { ProjectConfig } from "../../../../src/config/project"
import { GardenPluginSpec } from "../../../../src/plugin/plugin"
import { TestGarden } from "../../../../src/util/testing"
import {
  createProjectConfig,
  customizedTestPlugin,
  expectError,
  makeDeploy,
  makeTempDir,
  withDefaultGlobalOpts,
} from "../../../helpers"
import { formatForTerminal } from "../../../../src/logger/renderers"
import chalk from "chalk"
import { LogEntry } from "../../../../src/logger/log-entry"
import { LogLevel } from "../../../../src/logger/logger"
import { DeployLogEntry } from "../../../../src/types/service"
import { GetDeployLogs } from "../../../../src/plugin/handlers/Deploy/get-logs"
import { BaseActionConfig } from "../../../../src/actions/types"
import { LogMonitor, logMonitorColors } from "../../../../src/monitors/logs"
import stripAnsi from "strip-ansi"
import { execDeploySpecSchema } from "../../../../src/plugins/exec/deploy"
import { joi } from "../../../../src/config/common"
import { ActionTypeHandlerParamsType } from "../../../../src/plugin/handlers/base/base"

// TODO-G2: rename test cases to match the new graph model semantics

function makeCommandParams({
  garden,
  args = { services: undefined },
  opts = {},
}: {
  garden: Garden
  args?: any
  opts?: any
}) {
  const log = garden.log
  return {
    garden,
    log,
    args,
    opts: withDefaultGlobalOpts({
      ...opts,
    }),
  }
}

async function makeGarden({ tmpDir, plugin }: { tmpDir: tmp.DirectoryResult; plugin: GardenPluginSpec }) {
  const config: ProjectConfig = createProjectConfig({
    path: tmpDir.path,
    providers: [{ name: "test" }],
  })

  const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [plugin] })
  garden.setActionConfigs([makeDeploy("test-service-a", tmpDir.path)])
  return garden
}

// Returns all entries that match the logMsg as string, sorted by service name.
function getLogOutput(garden: TestGarden, msg: string, extraFilter: (e: LogEntry) => boolean = () => true) {
  const entries = garden.log
    .getLogEntries()
    .filter(extraFilter)
    .filter((e) => e.msg?.includes(msg))!
  return entries.map((e) => formatForTerminal(e, garden.log.root).trim())
}

describe("LogsCommand", () => {
  let tmpDir: tmp.DirectoryResult
  const timestamp = new Date()
  const msgColor = chalk.bgRedBright
  const logMsg = "Yes, this is log"
  const logMsgWithColor = msgColor(logMsg)
  const color = chalk[logMonitorColors[0]]

  type GetDeployLogsParams = ActionTypeHandlerParamsType<GetDeployLogs>

  const defaultLogsHandler = async ({ stream }: GetDeployLogsParams) => {
    void stream.write({
      tags: { container: "my-container" },
      name: "test-service-a",
      msg: logMsgWithColor,
      timestamp,
    })
    return {}
  }

  const makeTestPlugin = (logsHandler = defaultLogsHandler) => {
    return customizedTestPlugin({
      name: "test",
      createActionTypes: {
        Deploy: [
          {
            name: "test",
            docs: "Test Deploy action",
            schema: joi.object().zodSchema(execDeploySpecSchema),
            handlers: {
              getLogs: logsHandler,
            },
          },
        ],
      },
    })
  }

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
  })

  beforeEach(() => {
    LogMonitor.resetGlobalState()
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  context("follow=false", () => {
    it("should return service logs", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden }))
      expect(res).to.eql({
        result: [
          {
            tags: { container: "my-container" },
            name: "test-service-a",
            msg: logMsgWithColor,
            timestamp,
          },
        ],
      })
    })
    it("should sort entries by timestamp", async () => {
      const getServiceLogsHandler = async (params: GetDeployLogsParams) => {
        void params.stream.write({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "3",
          timestamp: new Date("2021-05-13T20:03:00.000Z"),
        })
        void params.stream.write({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "4",
          timestamp: new Date("2021-05-13T20:04:00.000Z"),
        })
        void params.stream.write({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "2",
          timestamp: new Date("2021-05-13T20:02:00.000Z"),
        })
        void params.stream.write({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "1",
          timestamp: new Date("2021-05-13T20:01:00.000Z"),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden }))

      expect(res).to.eql({
        result: [
          {
            tags: { container: "my-container" },
            name: "test-service-a",
            msg: "1",
            timestamp: new Date("2021-05-13T20:01:00.000Z"),
          },
          {
            tags: { container: "my-container" },
            name: "test-service-a",
            msg: "2",
            timestamp: new Date("2021-05-13T20:02:00.000Z"),
          },
          {
            tags: { container: "my-container" },
            name: "test-service-a",
            msg: "3",
            timestamp: new Date("2021-05-13T20:03:00.000Z"),
          },
          {
            tags: { container: "my-container" },
            name: "test-service-a",
            timestamp: new Date("2021-05-13T20:04:00.000Z"),
            msg: "4",
          },
        ],
      })
    })
    it("should skip empty entries", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        // Empty message and invalid date
        void stream.write({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "",
          timestamp: new Date(""),
        })
        // Empty message and empty date
        void stream.write({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "",
          timestamp: undefined,
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden }))

      expect(res).to.eql({ result: [] })
    })
    it("should render the service name by default", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden }))

      const out = getLogOutput(garden, logMsg)

      expect(stripAnsi(out[0])).to.eql(`test-service-a → Yes, this is log`)
    })
    it("should optionally skip rendering the service name", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "hide-name": true } }))

      const out = getLogOutput(garden, logMsg)

      expect(stripAnsi(out[0])).to.eql("Yes, this is log")
    })
    it("should optionally show timestamps", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { timestamps: true } }))

      const out = getLogOutput(garden, logMsg)

      expect(stripAnsi(out[0])).to.eql(`test-service-a → ${timestamp.toISOString()} → Yes, this is log`)
    })
    it("should set the '--tail' and since flag", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { tail: 5, follow: true } }))

      const monitors = garden.monitors.getBySubscriber(command)
      const tailOpts = monitors.map((m) => m["tail"])
      expect(tailOpts.every((o) => o === 5)).to.be.true
    })
    it("should set the '--since' flag", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { since: "10s", follow: true } }))

      const monitors = garden.monitors.getBySubscriber(command)
      const sinceOpts = monitors.map((m) => m["since"])
      expect(sinceOpts.every((o) => o === "10s")).to.be.true
    })
    it("should have the '--tail' flag overwrite the '--since' flag if both are set", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { since: "10s", tail: 5, follow: true } }))

      const monitors = garden.monitors.getBySubscriber(command)
      const tailOpts = monitors.map((m) => m["tail"])
      const sinceOpts = monitors.map((m) => m["since"])
      expect(tailOpts.every((o) => o === 5)).to.be.true
      expect(sinceOpts.every((o) => o === undefined)).to.be.true
    })
    it("should have '--tail=0' overwrite the '--since' flag if both are set", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { since: "10s", tail: 0, follow: true } }))

      const monitors = garden.monitors.getBySubscriber(command)
      const tailOpts = monitors.map((m) => m["tail"])
      const sinceOpts = monitors.map((m) => m["since"])
      expect(tailOpts.every((o) => o === 0)).to.be.true
      expect(sinceOpts.every((o) => o === undefined)).to.be.true
    })
    context("mutliple services", () => {
      it("should align content for visible entries", async () => {
        const getServiceLogsHandler = async ({ action, stream }: GetDeployLogsParams) => {
          if (action.name === "a-short") {
            void stream.write({
              tags: { container: "short" },
              name: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:01:00.000Z"), // <--- 1
            })
            void stream.write({
              tags: { container: "short" },
              name: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:03:00.000Z"), // <--- 3
            })
            void stream.write({
              tags: { container: "short" },
              name: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:06:00.000Z"), // <--- 6
            })
          } else if (action.name === "b-not-short") {
            void stream.write({
              tags: { container: "not-short" },
              name: "b-not-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:02:00.000Z"), // <--- 2
            })
          } else if (action.name === "c-by-far-the-longest-of-the-bunch") {
            void stream.write({
              tags: { container: "by-far-the-longest-of-the-bunch" },
              name: "c-by-far-the-longest-of-the-bunch",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:04:00.000Z"), // <--- 4
              level: LogLevel.verbose,
            })
          } else if (action.name === "d-very-very-long") {
            void stream.write({
              tags: { container: "very-very-long" },
              name: "d-very-very-long",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:05:00.000Z"), // <--- 5
            })
          }
          return {}
        }
        const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })

        garden.setActionConfigs([
          makeDeploy("a-short", tmpDir.path),
          makeDeploy("b-not-short", tmpDir.path),
          makeDeploy("c-by-far-the-longest-of-the-bunch", tmpDir.path),
          makeDeploy("d-very-very-long", tmpDir.path),
        ])

        const command = new LogsCommand()
        await command.action(makeCommandParams({ garden, opts: { "show-tags": true } }))

        const out = getLogOutput(garden, logMsg, (entry) => entry.level === LogLevel.info)

        expect(stripAnsi(out[0])).to.eql(`a-short → [container=short] ${logMsg}`)
        expect(stripAnsi(out[1])).to.eql(`b-not-short → [container=not-short] ${logMsg}`)
        expect(stripAnsi(out[2])).to.eql(`a-short     → [container=short] ${logMsg}`)
        expect(stripAnsi(out[3])).to.eql(`d-very-very-long → [container=very-very-long] ${logMsg}`)
        expect(stripAnsi(out[4])).to.eql(`a-short          → [container=short] ${logMsg}`)
      })
    })

    const actionConfigsForTags = (): BaseActionConfig[] => [
      makeDeploy("api", tmpDir.path),
      makeDeploy("frontend", tmpDir.path),
    ]

    it("should optionally print tags with --show-tags", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        void stream.write({
          tags: { container: "api" },
          name: "api",
          msg: logMsgWithColor,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "show-tags": true } }))
      const out = getLogOutput(garden, logMsg)

      expect(stripAnsi(out[0])).to.include("[container=api]")
    })

    // These tests use tags as emitted by `container`/`kubernetes`/`helm` services, which use the `container` tag.
    const filterByTag = (entries: DeployLogEntry[], tag: string): DeployLogEntry[] => {
      return entries.filter((e: DeployLogEntry) => e.tags!["container"] === tag)
    }

    it("should apply a basic --tag filter", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        void stream.write({
          tags: { container: "api" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "frontend" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden, opts: { tag: ["container=api"] } }))

      expect(filterByTag(res.result!, "api").length).to.eql(2)
      expect(filterByTag(res.result!, "frontend").length).to.eql(0)
    })

    it("should throw when passed an invalid --tag filter", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        void stream.write({
          tags: { container: "api-main" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      await expectError(() => command.action(makeCommandParams({ garden, opts: { tag: ["*-main"] } })), {
        contains: "Unable to parse the given --tag flags. Format should be key=value.",
      })
    })

    it("should AND together tag filters in a given --tag option instance", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        void stream.write({
          tags: { container: "api", myTag: "1" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "api", myTag: "2" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "frontend", myTag: "1" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden, opts: { tag: ["container=api,myTag=1"] } }))

      const matching = filterByTag(res.result!, "api")
      expect(matching.length).to.eql(2) // The same log line is emitted for each service in this test setup (here: 2)
      expect(matching[0].tags).to.eql({ container: "api", myTag: "1" })
      expect(matching[1].tags).to.eql({ container: "api", myTag: "1" })
    })

    it("should OR together tag filters from all provided --tag option instances", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        void stream.write({
          tags: { container: "api", myTag: "1" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "api", myTag: "2" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "frontend", myTag: "1" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "frontend", myTag: "2" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(
        makeCommandParams({ garden, opts: { tag: ["container=api,myTag=1", "container=frontend"] } })
      )

      const apiMatching = filterByTag(res.result!, "api")
      const frontendMatching = filterByTag(res.result!, "frontend")
      expect(apiMatching.length).to.eql(2) // The same log line is emitted for each service in this test setup (here: 2)
      expect(apiMatching[0].tags).to.eql({ container: "api", myTag: "1" })
      expect(apiMatching[1].tags).to.eql({ container: "api", myTag: "1" })
      expect(frontendMatching.length).to.eql(4)
      expect(frontendMatching[0].tags).to.eql({ container: "frontend", myTag: "1" })
      expect(frontendMatching[1].tags).to.eql({ container: "frontend", myTag: "2" })
    })

    it("should apply a wildcard --tag filter", async () => {
      const getServiceLogsHandler = async ({ stream }: GetDeployLogsParams) => {
        void stream.write({
          tags: { container: "api-main" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "api-sidecar" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "frontend-main" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        void stream.write({
          tags: { container: "frontend-sidecar" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden, opts: { tag: ["container=*-main"] } }))

      expect(filterByTag(res.result!, "api-main").length).to.eql(2)
      expect(filterByTag(res.result!, "frontend-main").length).to.eql(2)
      expect(filterByTag(res.result!, "api-sidecar").length).to.eql(0)
      expect(filterByTag(res.result!, "frontend-sidecar").length).to.eql(0)
    })
  })
})
