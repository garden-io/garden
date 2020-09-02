/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import execa from "execa"

import { ProjectConfig, defaultNamespace } from "../../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"
import { joi } from "../../../../../src/config/common"
import { ServiceState } from "../../../../../src/types/service"
import { GetServiceStatusParams } from "../../../../../src/types/plugin/service/getServiceStatus"
import { TestGarden, getLogMessages } from "../../../../helpers"
import { GetStatusCommand } from "../../../../../src/commands/get/get-status"
import { withDefaultGlobalOpts } from "../../../../helpers"
import { expect } from "chai"
import { LogLevel } from "../../../../../src/logger/log-node"

describe("GetStatusCommand", () => {
  let tmpDir: tmp.DirectoryResult
  let config: ProjectConfig

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })

    await execa("git", ["init"], { cwd: tmpDir.path })

    config = {
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
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("action", () => {
    it("should warn if a service's status can't be resolved", async () => {
      const testPlugin = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
            handlers: {
              build: async () => ({}),
              getServiceStatus: async ({ service }: GetServiceStatusParams) => {
                return {
                  state: <ServiceState>"ready",
                  detail: {},
                  outputs: { log: service.spec.log },
                }
              },
            },
          },
        ],
      })

      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

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
              name: "test-service",
              dependencies: ["test-task"],
              disabled: false,
              hotReloadable: false,
              spec: {
                log: "${runtime.tasks.test-task.outputs.log}",
              },
            },
          ],
          taskConfigs: [
            {
              name: "test-task",
              cacheResult: true,
              dependencies: [],
              disabled: false,
              spec: {
                log: "test output",
              },
              timeout: 10,
            },
          ],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      ])

      const command = new GetStatusCommand()
      const log = garden.log
      const { result } = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
        headerLog: log,
        footerLog: log,
      })

      expect(command.outputsSchema().validate(result).error).to.be.undefined

      const logMessages = getLogMessages(log, (l) => l.level === LogLevel.warn)

      expect(logMessages).to.include(
        "Unable to resolve status for service test-service. It is likely missing or outdated. This can come up if the service has runtime dependencies that are not resolvable, i.e. not deployed or invalid."
      )
    })
  })
})
