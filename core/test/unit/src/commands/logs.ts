/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { expect } from "chai"
import { Garden } from "../../../../src"
import { colors, LogsCommand } from "../../../../src/commands/logs"
import { joi } from "../../../../src/config/common"
import { ProjectConfig, defaultNamespace } from "../../../../src/config/project"
import { createGardenPlugin, GardenPlugin } from "../../../../src/types/plugin/plugin"
import { GetServiceLogsParams } from "../../../../src/types/plugin/service/getServiceLogs"
import { TestGarden } from "../../../../src/util/testing"
import { projectRootA, withDefaultGlobalOpts } from "../../../helpers"
import execa from "execa"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { formatForTerminal } from "../../../../src/logger/renderers"
import chalk from "chalk"
import { LogEntry } from "../../../../src/logger/log-entry"
import { LogLevel } from "../../../../src/logger/logger"

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
    headerLog: log,
    footerLog: log,
    args,
    opts: withDefaultGlobalOpts({
      ...opts,
    }),
  }
}

async function makeGarden(tmpDir: tmp.DirectoryResult, plugin: GardenPlugin) {
  const config: ProjectConfig = {
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: tmpDir.path,
    defaultEnvironment: "default",
    dotIgnoreFiles: [],
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "test" }],
    variables: {},
  }

  const garden = await TestGarden.factory(projectRootA, { config, plugins: [plugin] })
  garden.setModuleConfigs([
    {
      apiVersion: DEFAULT_API_VERSION,
      name: "test",
      type: "test",
      allowPublish: false,
      disabled: false,
      build: { dependencies: [] },
      path: tmpDir.path,
      serviceConfigs: [
        {
          name: "test-service-a",
          dependencies: [],
          disabled: false,
          hotReloadable: false,
          spec: {},
        },
      ],
      taskConfigs: [],
      testConfigs: [],
      spec: { bla: "fla" },
    },
  ])
  return garden
}

// Returns all entries that match the logMsg as string, sorted by service name.
function getLogOutput(garden: TestGarden, msg: string, extraFilter: (e: LogEntry) => boolean = () => true) {
  const entries = garden.log
    .getChildEntries()
    .filter(extraFilter)
    .filter((e) => e.getLatestMessage().msg?.includes(msg))!
  return entries.map((e) => formatForTerminal(e, "basic").trim())
}

describe("LogsCommand", () => {
  let tmpDir: tmp.DirectoryResult
  const timestamp = new Date()
  const originalColor = chalk.bgRedBright
  const logMsg = "Yes, this is log"
  const logMsgWithColor = originalColor(logMsg)

  const color = chalk[colors[0]]
  const defaultGetServiceLogsHandler = async ({ stream }: GetServiceLogsParams) => {
    void stream.write({
      containerName: "my-container",
      serviceName: "test-service-a",
      msg: logMsgWithColor,
      timestamp,
    })
    return {}
  }

  const makeTestPlugin = (getServiceLogsHandler = defaultGetServiceLogsHandler) => {
    return createGardenPlugin({
      name: "test",
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          schema: joi.object(),
          handlers: {
            getServiceLogs: getServiceLogsHandler,
          },
        },
      ],
    })
  }

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })

    await execa("git", ["init"], { cwd: tmpDir.path })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  context("follow=false", () => {
    it("should return service logs", async () => {
      const garden = await makeGarden(tmpDir, makeTestPlugin())
      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden }))
      expect(res).to.eql({
        result: [
          {
            containerName: "my-container",
            serviceName: "test-service-a",
            msg: logMsgWithColor,
            timestamp,
          },
        ],
      })
    })
    it("should sort entries by timestamp", async () => {
      const getServiceLogsHandler = async ({ stream }: GetServiceLogsParams) => {
        void stream.write({
          containerName: "my-container",
          serviceName: "test-service-a",
          msg: "3",
          timestamp: new Date("2021-05-13T20:03:00.000Z"),
        })
        void stream.write({
          containerName: "my-container",
          serviceName: "test-service-a",
          msg: "4",
          timestamp: new Date("2021-05-13T20:04:00.000Z"),
        })
        void stream.write({
          containerName: "my-container",
          serviceName: "test-service-a",
          msg: "2",
          timestamp: new Date("2021-05-13T20:02:00.000Z"),
        })
        void stream.write({
          containerName: "my-container",
          serviceName: "test-service-a",
          msg: "1",
          timestamp: new Date("2021-05-13T20:01:00.000Z"),
        })
        return {}
      }
      const garden = await makeGarden(tmpDir, makeTestPlugin(getServiceLogsHandler))

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden }))

      expect(res).to.eql({
        result: [
          {
            containerName: "my-container",
            serviceName: "test-service-a",
            msg: "1",
            timestamp: new Date("2021-05-13T20:01:00.000Z"),
          },
          {
            containerName: "my-container",
            serviceName: "test-service-a",
            msg: "2",
            timestamp: new Date("2021-05-13T20:02:00.000Z"),
          },
          {
            containerName: "my-container",
            serviceName: "test-service-a",
            msg: "3",
            timestamp: new Date("2021-05-13T20:03:00.000Z"),
          },
          {
            containerName: "my-container",
            serviceName: "test-service-a",
            timestamp: new Date("2021-05-13T20:04:00.000Z"),
            msg: "4",
          },
        ],
      })
    })
    it("should skip empty entries", async () => {
      const getServiceLogsHandler = async ({ stream }: GetServiceLogsParams) => {
        // Empty message and invalid date
        void stream.write({
          containerName: "my-container",
          serviceName: "test-service-a",
          msg: "",
          timestamp: new Date(""),
        })
        // Empty message and empty date
        void stream.write({
          containerName: "my-container",
          serviceName: "test-service-a",
          msg: "",
          timestamp: undefined,
        })
        return {}
      }
      const garden = await makeGarden(tmpDir, makeTestPlugin(getServiceLogsHandler))

      const command = new LogsCommand()
      const res = await command.action(makeCommandParams({ garden }))

      expect(res).to.eql({ result: [] })
    })
    it("should render the service name by default", async () => {
      const garden = await makeGarden(tmpDir, makeTestPlugin())
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(`${color.bold("test-service-a")} → ${color("Yes, this is log")}`)
    })
    it("should optionally skip rendering the service name", async () => {
      const garden = await makeGarden(tmpDir, makeTestPlugin())
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "hide-service": true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(color("Yes, this is log"))
    })
    it("should optionally show the container name", async () => {
      const garden = await makeGarden(tmpDir, makeTestPlugin())
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "show-container": true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(
        `${color.bold("test-service-a")} → ${color.bold("my-container")} → ${color("Yes, this is log")}`
      )
    })
    it("should optionally show timestamps", async () => {
      const garden = await makeGarden(tmpDir, makeTestPlugin())
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { timestamps: true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(
        `${color.bold("test-service-a")} → ${chalk.gray(timestamp.toISOString())} → ${color("Yes, this is log")}`
      )
    })
    it("should optionally show the original log color", async () => {
      const garden = await makeGarden(tmpDir, makeTestPlugin())
      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "original-color": true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(`${color.bold("test-service-a")} → ${originalColor("Yes, this is log")}`)
    })
    context("mutliple services", () => {
      it("should align content for visible entries", async () => {
        const getServiceLogsHandler = async ({ stream, service }: GetServiceLogsParams) => {
          if (service.name === "a-short") {
            void stream.write({
              containerName: "short",
              serviceName: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:01:00.000Z"), // <--- 1
            })
            void stream.write({
              containerName: "short",
              serviceName: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:03:00.000Z"), // <--- 3
            })
            void stream.write({
              containerName: "short",
              serviceName: "a-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:06:00.000Z"), // <--- 6
            })
          } else if (service.name === "b-not-short") {
            void stream.write({
              containerName: "not-short",
              serviceName: "b-not-short",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:02:00.000Z"), // <--- 2
            })
          } else if (service.name === "c-by-far-the-longest-of-the-bunch") {
            void stream.write({
              containerName: "by-far-the-longest-of-the-bunch",
              serviceName: "c-by-far-the-longest-of-the-bunch",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:04:00.000Z"), // <--- 4
              level: LogLevel.verbose,
            })
          } else if (service.name === "d-very-very-long") {
            void stream.write({
              containerName: "very-very-long",
              serviceName: "d-very-very-long",
              msg: logMsgWithColor,
              timestamp: new Date("2021-05-13T20:05:00.000Z"), // <--- 5
            })
          }
          return {}
        }
        const garden = await makeGarden(tmpDir, makeTestPlugin(getServiceLogsHandler))
        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            name: "test",
            type: "test",
            allowPublish: false,
            disabled: false,
            build: { dependencies: [] },
            path: tmpDir.path,
            serviceConfigs: [
              {
                name: "a-short",
                dependencies: [],
                disabled: false,
                hotReloadable: false,
                spec: {},
              },
              {
                name: "b-not-short",
                dependencies: [],
                disabled: false,
                hotReloadable: false,
                spec: {},
              },
              {
                name: "c-by-far-the-longest-of-the-bunch",
                dependencies: [],
                disabled: false,
                hotReloadable: false,
                spec: {},
              },
              {
                name: "d-very-very-long",
                dependencies: [],
                disabled: false,
                hotReloadable: false,
                spec: {},
              },
            ],
            taskConfigs: [],
            testConfigs: [],
            spec: { bla: "fla" },
          },
        ])

        // Entries are color coded by their alphabetical order
        const colA = chalk[colors[0]]
        const colB = chalk[colors[1]]
        const colD = chalk[colors[3]]
        const command = new LogsCommand()
        await command.action(makeCommandParams({ garden, opts: { "show-container": true } }))

        const out = getLogOutput(garden, logMsg, (entry) => entry.level === LogLevel.info)

        expect(out[0]).to.eql(`${colA.bold("a-short")} → ${colA.bold("short")} → ${colA(logMsg)}`)
        expect(out[1]).to.eql(`${colB.bold("b-not-short")} → ${colB.bold("not-short")} → ${colB(logMsg)}`)
        expect(out[2]).to.eql(`${colA.bold("a-short    ")} → ${colA.bold("short    ")} → ${colA(logMsg)}`)
        expect(out[3]).to.eql(`${colD.bold("d-very-very-long")} → ${colD.bold("very-very-long")} → ${colD(logMsg)}`)
        expect(out[4]).to.eql(`${colA.bold("a-short         ")} → ${colA.bold("short         ")} → ${colA(logMsg)}`)
      })
    })
    it("should assign the same color to each service, regardless of which service logs are streamed", async () => {
      const getServiceLogsHandler = async ({ stream, service }: GetServiceLogsParams) => {
        if (service.name === "test-service-a") {
          void stream.write({
            containerName: "my-container",
            serviceName: "test-service-a",
            msg: logMsg,
            timestamp: new Date("2021-05-13T20:00:00.000Z"),
          })
        } else {
          void stream.write({
            containerName: "my-container",
            serviceName: "test-service-b",
            msg: logMsg,
            timestamp: new Date("2021-05-13T20:01:00.000Z"),
          })
        }
        return {}
      }
      const garden = await makeGarden(tmpDir, makeTestPlugin(getServiceLogsHandler))
      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "test",
          type: "test",
          allowPublish: false,
          disabled: false,
          build: { dependencies: [] },
          path: tmpDir.path,
          serviceConfigs: [
            {
              name: "test-service-a",
              dependencies: [],
              disabled: false,
              hotReloadable: false,
              spec: {},
            },
            {
              name: "test-service-b",
              dependencies: [],
              disabled: false,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      ])
      const command = new LogsCommand()
      // Only get logs for test-service-b.
      await command.action(makeCommandParams({ garden, args: { services: ["test-service-b"] } }))

      const out = getLogOutput(garden, logMsg)
      const color2 = chalk[colors[1]]

      // Assert that the service gets the "second" color, even though its the only one we're fetching logs for.
      expect(out[0]).to.eql(`${color2.bold("test-service-b")} → ${color2("Yes, this is log")}`)
    })
  })
})
