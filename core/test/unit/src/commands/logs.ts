/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type tmp from "tmp-promise"
import { expect } from "chai"
import type { Garden } from "../../../../src/index.js"
import { LogsCommand } from "../../../../src/commands/logs.js"
import type { ProjectConfig } from "../../../../src/config/project.js"
import type { GardenPluginSpec } from "../../../../src/plugin/plugin.js"
import { TestGarden } from "../../../../src/util/testing.js"
import {
  createProjectConfig,
  customizedTestPlugin,
  expectError,
  makeTempDir,
  withDefaultGlobalOpts,
} from "../../../helpers.js"
import { DEFAULT_DEPLOY_TIMEOUT_SEC, GardenApiVersion } from "../../../../src/constants.js"
import { formatForTerminal } from "../../../../src/logger/renderers.js"
import { resolveMsg, type LogEntry } from "../../../../src/logger/log-entry.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import type { DeployLogEntry } from "../../../../src/types/service.js"
import type { GetDeployLogs } from "../../../../src/plugin/handlers/Deploy/get-logs.js"
import type { BaseActionConfig } from "../../../../src/actions/types.js"
import { LogMonitor, logMonitorColors } from "../../../../src/monitors/logs.js"
import { execDeploySpecSchema } from "../../../../src/plugins/exec/deploy.js"
import { joi } from "../../../../src/config/common.js"
import type { ActionTypeHandlerParamsType } from "../../../../src/plugin/handlers/base/base.js"
import { styles } from "../../../../src/logger/styles.js"
import chalk from "chalk"

// TODO-G2: rename test cases to match the new graph model semantics

function makeCommandParams({
  garden,
  args = { services: undefined },
  opts = {},
}: {
  garden: Garden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

const makeDeployAction = (basePath: string, name: string): BaseActionConfig => ({
  apiVersion: GardenApiVersion.v0,
  kind: "Deploy",
  name,
  type: "test",
  disabled: false,
  internal: {
    basePath,
  },
  timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
  spec: {
    deployCommand: ["echo", "ok"],
  },
})

async function makeGarden({ tmpDir, plugin }: { tmpDir: tmp.DirectoryResult; plugin: GardenPluginSpec }) {
  const config: ProjectConfig = createProjectConfig({
    path: tmpDir.path,
    providers: [{ name: "test" }],
  })

  const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [plugin] })
  garden.setPartialActionConfigs([makeDeployAction(tmpDir.path, "test-service-a")])
  return garden
}

// Returns all entries that match the logMsg as string, sorted by service name.
function getLogOutput(garden: TestGarden, msg: string, extraFilter: (e: LogEntry) => boolean = () => true) {
  const entries = garden.log
    .getLogEntries()
    .filter(extraFilter)
    .filter((e) => resolveMsg(e)?.includes(msg))!
  return entries.map((e) => formatForTerminal(e, garden.log.root).trim())
}

describe("LogsCommand", () => {
  let tmpDir: tmp.DirectoryResult
  const timestamp = new Date()
  const msgColor = styles.error
  const logMsg = "Yes, this is log"
  const logMsgWithColor = msgColor(logMsg)
  const sectionStyle = chalk[logMonitorColors[0]].bold
  const arrow = " → "

  type GetDeployLogsParams = ActionTypeHandlerParamsType<GetDeployLogs>

  const defaultLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
    onLogEntry({
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
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "3",
          timestamp: new Date("2021-05-13T20:03:00.000Z"),
        })
        onLogEntry({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "4",
          timestamp: new Date("2021-05-13T20:04:00.000Z"),
        })
        onLogEntry({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "2",
          timestamp: new Date("2021-05-13T20:02:00.000Z"),
        })
        onLogEntry({
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
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        // Empty message and invalid date
        onLogEntry({
          tags: { container: "my-container" },
          name: "test-service-a",
          msg: "",
          timestamp: new Date(""),
        })
        // Empty message and empty date
        onLogEntry({
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

      expect(out[0]).to.eql(styles.primary(sectionStyle("test-service-a") + arrow + msgColor("Yes, this is log")))
    })
    it("should optionally skip rendering the service name", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "hide-name": true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(styles.primary(msgColor("Yes, this is log")))
    })
    it("should optionally show timestamps", async () => {
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin() })
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { timestamps: true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(
        styles.primary(
          sectionStyle("test-service-a") +
            arrow +
            sectionStyle(timestamp.toISOString()) +
            arrow +
            msgColor("Yes, this is log")
        )
      )
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
    context("multiple services", () => {
      it("should align content for visible entries", async () => {
        const getServiceLogsHandler = async ({ action, onLogEntry }: GetDeployLogsParams) => {
          if (action.name === "a-short") {
            onLogEntry({
              tags: { container: "short" },
              name: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:01:00.000Z"), // <--- 1
            })
            onLogEntry({
              tags: { container: "short" },
              name: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:03:00.000Z"), // <--- 3
            })
            onLogEntry({
              tags: { container: "short" },
              name: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:06:00.000Z"), // <--- 6
            })
          } else if (action.name === "b-not-short") {
            onLogEntry({
              tags: { container: "not-short" },
              name: "b-not-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:02:00.000Z"), // <--- 2
            })
          } else if (action.name === "c-by-far-the-longest-of-the-bunch") {
            onLogEntry({
              tags: { container: "by-far-the-longest-of-the-bunch" },
              name: "c-by-far-the-longest-of-the-bunch",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:04:00.000Z"), // <--- 4
              level: LogLevel.verbose,
            })
          } else if (action.name === "d-very-very-long") {
            onLogEntry({
              tags: { container: "very-very-long" },
              name: "d-very-very-long",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:05:00.000Z"), // <--- 5
            })
          }
          return {}
        }
        const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })

        garden.setPartialActionConfigs([
          makeDeployAction(tmpDir.path, "a-short"),
          makeDeployAction(tmpDir.path, "b-not-short"),
          makeDeployAction(tmpDir.path, "c-by-far-the-longest-of-the-bunch"),
          makeDeployAction(tmpDir.path, "d-very-very-long"),
        ])

        const command = new LogsCommand()
        await command.action(makeCommandParams({ garden, opts: { "show-tags": true } }))

        const out = getLogOutput(garden, logMsg, (entry) => entry.level === LogLevel.info)
        const sectionStyleA = chalk.green.bold
        const sectionStyleB = chalk.cyan.bold
        // Note that we hop over C since that entry has a higher level
        const sectionStyleD = chalk.yellow.bold

        expect(out[0]).to.eql(
          styles.primary(`${sectionStyleA("a-short")} → ${sectionStyleA("[container=short] ")}${logMsgWithColor}`)
        )
        expect(out[1]).to.eql(
          styles.primary(
            `${sectionStyleB("b-not-short")} → ${sectionStyleB("[container=not-short] ")}${logMsgWithColor}`
          )
        )
        // Same name as first entry so same section style
        expect(out[2]).to.eql(
          styles.primary(`${sectionStyleA("a-short    ")} → ${sectionStyleA("[container=short] ")}${logMsgWithColor}`)
        )
        expect(out[3]).to.eql(
          styles.primary(
            `${sectionStyleD("d-very-very-long")} → ${sectionStyleD("[container=very-very-long] ")}${logMsgWithColor}`
          )
        )
        // Same name as first entry so same section style
        expect(out[4]).to.eql(
          styles.primary(
            `${sectionStyleA("a-short         ")} → ${sectionStyleA("[container=short] ")}${logMsgWithColor}`
          )
        )
      })
    })

    const actionConfigsForTags = (): BaseActionConfig[] => [
      makeDeployAction(tmpDir.path, "api"),
      makeDeployAction(tmpDir.path, "frontend"),
    ]

    it("should optionally print tags with --show-tags", async () => {
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "api" },
          name: "api",
          msg: logMsgWithColor,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setPartialActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "show-tags": true } }))
      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(
        styles.primary(sectionStyle("api") + arrow + sectionStyle("[container=api] ") + logMsgWithColor)
      )
    })

    // These tests use tags as emitted by `container`/`kubernetes`/`helm` services, which use the `container` tag.
    const filterByTag = (entries: DeployLogEntry[], tag: string): DeployLogEntry[] => {
      return entries.filter((e: DeployLogEntry) => e.tags!["container"] === tag)
    }

    it("should apply a basic --tag filter", async () => {
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "api" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "frontend" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setPartialActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden, opts: { tag: ["container=api"] } }))

      expect(filterByTag(res.result!, "api").length).to.eql(2)
      expect(filterByTag(res.result!, "frontend").length).to.eql(0)
    })

    it("should throw when passed an invalid --tag filter", async () => {
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "api-main" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setPartialActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      await expectError(() => command.action(makeCommandParams({ garden, opts: { tag: ["*-main"] } })), {
        contains: "Unable to parse the given --tag flags. Format should be key=value.",
      })
    })

    it("should AND together tag filters in a given --tag option instance", async () => {
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "api", myTag: "1" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "api", myTag: "2" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "frontend", myTag: "1" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setPartialActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden, opts: { tag: ["container=api,myTag=1"] } }))

      const matching = filterByTag(res.result!, "api")
      expect(matching.length).to.eql(2) // The same log line is emitted for each service in this test setup (here: 2)
      expect(matching[0].tags).to.eql({ container: "api", myTag: "1" })
      expect(matching[1].tags).to.eql({ container: "api", myTag: "1" })
    })

    it("should OR together tag filters from all provided --tag option instances", async () => {
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "api", myTag: "1" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "api", myTag: "2" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "frontend", myTag: "1" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "frontend", myTag: "2" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setPartialActionConfigs(actionConfigsForTags())

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
      const getServiceLogsHandler = async ({ onLogEntry }: GetDeployLogsParams) => {
        onLogEntry({
          tags: { container: "api-main" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "api-sidecar" },
          name: "api",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "frontend-main" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        onLogEntry({
          tags: { container: "frontend-sidecar" },
          name: "frontend",
          msg: logMsg,
          timestamp: new Date(),
        })
        return {}
      }
      const garden = await makeGarden({ tmpDir, plugin: makeTestPlugin(getServiceLogsHandler) })
      garden.setPartialActionConfigs(actionConfigsForTags())

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden, opts: { tag: ["container=*-main"] } }))

      expect(filterByTag(res.result!, "api-main").length).to.eql(2)
      expect(filterByTag(res.result!, "frontend-main").length).to.eql(2)
      expect(filterByTag(res.result!, "api-sidecar").length).to.eql(0)
      expect(filterByTag(res.result!, "frontend-sidecar").length).to.eql(0)
    })
  })
})
