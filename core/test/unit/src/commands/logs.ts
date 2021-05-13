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
function getLogOutput(garden: TestGarden, msg: string) {
  const entries = garden.log.getChildEntries().filter((e) => e.getLatestMessage().msg?.includes(msg))!
  return (
    entries
      // .sort((a, b) => (stripAnsi(a.getLatestMessage().msg!) > stripAnsi(b.getLatestMessage().msg!) ? 1 : -1))
      .map((e) => formatForTerminal(e, "basic").trim())
  )
  // .join("\n")
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
    it("should align content wrt to container names when visible", async () => {
      const getServiceLogsHandler = async ({ stream }: GetServiceLogsParams) => {
        void stream.write({
          containerName: "short",
          serviceName: "test-service-a",
          msg: logMsgWithColor,
          timestamp,
        })
        void stream.write({
          containerName: "very-long",
          serviceName: "test-service-a",
          msg: logMsgWithColor,
          timestamp,
        })
        void stream.write({
          containerName: "short",
          serviceName: "test-service-a",
          msg: logMsgWithColor,
          timestamp,
        })
        void stream.write({
          containerName: "very-very-long",
          serviceName: "test-service-a",
          msg: logMsgWithColor,
          timestamp,
        })
        void stream.write({
          containerName: "short",
          serviceName: "test-service-a",
          msg: logMsgWithColor,
          timestamp,
        })
        return {}
      }
      const garden = await makeGarden(tmpDir, makeTestPlugin(getServiceLogsHandler))

      const command = new LogsCommand()
      await command.action(makeCommandParams({ garden, opts: { "show-container": true } }))

      const out = getLogOutput(garden, logMsg)

      expect(out[0]).to.eql(`${color.bold("test-service-a")} → ${color.bold("short")} → ${color("Yes, this is log")}`)
      expect(out[1]).to.eql(
        `${color.bold("test-service-a")} → ${color.bold("very-long")} → ${color("Yes, this is log")}`
      )
      expect(out[2]).to.eql(
        `${color.bold("test-service-a")} → ${color.bold("short    ")} → ${color("Yes, this is log")}`
      )
      expect(out[3]).to.eql(
        `${color.bold("test-service-a")} → ${color.bold("very-very-long")} → ${color("Yes, this is log")}`
      )
      expect(out[4]).to.eql(
        `${color.bold("test-service-a")} → ${color.bold("short         ")} → ${color("Yes, this is log")}`
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
    context("multiple services", () => {
      let gardenMultiService: TestGarden
      const getServiceLogsHandler = async ({ stream, service }: GetServiceLogsParams) => {
        if (service.name === "test-service-a") {
          void stream.write({
            containerName: "my-container",
            serviceName: "test-service-a",
            msg: logMsg,
            timestamp,
          })
        } else {
          void stream.write({
            containerName: "my-container",
            serviceName: "test-service-b",
            msg: logMsg,
            timestamp,
          })
        }
        return {}
      }
      beforeEach(async () => {
        gardenMultiService = await makeGarden(tmpDir, makeTestPlugin(getServiceLogsHandler))
        gardenMultiService.setModuleConfigs([
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
      })
      it("should give each service a unique color", async () => {
        // Given a project with multiple services...
        const command = new LogsCommand()
        // ...when we get the logs for all of them...
        await command.action(makeCommandParams({ garden: gardenMultiService }))

        const out = getLogOutput(gardenMultiService, logMsg)
        const color2 = chalk[colors[1]]

        // ...then they each get assigned a unique color...
        expect(out[0]).to.eql(`${color.bold("test-service-a")} → ${color("Yes, this is log")}`)
        expect(out[1]).to.eql(`${color2.bold("test-service-b")} → ${color2("Yes, this is log")}`)
      })
      it("should assign the same color to each service, regardless of which service logs are streamed", async () => {
        const command = new LogsCommand()
        await command.action(makeCommandParams({ garden: gardenMultiService, args: { services: ["test-service-b"] } }))

        const out = getLogOutput(gardenMultiService, logMsg)
        const color2 = chalk[colors[1]]

        // Assert that the service gets the "second" color, even though its the only one we're fetching logs for.
        expect(out[0]).to.eql(`${color2.bold("test-service-b")} → ${color2("Yes, this is log")}`)
      })
    })
  })
})
