/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"
import { GetConfigCommand } from "../../../../../src/commands/get/get-config"
import { sortBy } from "lodash"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"

describe("GetConfigCommand", () => {
  it("should get the project configuration", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetConfigCommand()

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false }),
    })

    const providers = await garden.resolveProviders()

    const config = {
      environmentName: garden.environmentName,
      providers,
      variables: garden.variables,
      moduleConfigs: sortBy(await garden.resolveModules({ log }), "name").map((m) => m._config),
      projectRoot: garden.projectRoot,
      projectId: "test-project-id",
    }

    expect(config).to.deep.equal(res.result)
  })

  it("should include disabled module configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetConfigCommand()

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: true,
        name: "a-disabled",
        include: [],
        outputs: {},
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service-a",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        include: [],
        name: "b-enabled",
        outputs: {},
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service-b",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false }),
    })

    const providers = await garden.resolveProviders()

    const expectedModuleConfigs = sortBy(await garden.resolveModules({ log, includeDisabled: true }), "name").map(
      (m) => m._config
    )

    const config = {
      environmentName: garden.environmentName,
      providers,
      variables: garden.variables,
      moduleConfigs: expectedModuleConfigs,
      projectRoot: garden.projectRoot,
      projectId: "test-project-id",
    }

    expect(expectedModuleConfigs.length).to.equal(2)
    expect(config).to.deep.equal(res.result)
  })

  it("should include disabled service configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetConfigCommand()

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "enabled",
        include: [],
        outputs: {},
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service-disabled",
              dependencies: [],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
            {
              name: "service-enabled",
              dependencies: [],
              disabled: false,
              hotReloadable: false,
              spec: {},
            },
          ],
          tasks: [
            {
              name: "task-enabled",
              dependencies: [],
              disabled: false,
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false }),
    })

    const providers = await garden.resolveProviders()

    const expectedModuleConfigs = (await garden.resolveModules({ log, includeDisabled: true })).map((m) => m._config)

    const config = {
      environmentName: garden.environmentName,
      providers,
      variables: garden.variables,
      moduleConfigs: expectedModuleConfigs,
      projectRoot: garden.projectRoot,
      projectId: "test-project-id",
    }

    expect(config).to.deep.equal(res.result)
  })

  it("should include disabled task configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetConfigCommand()

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "enabled",
        include: [],
        outputs: {},
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
          tasks: [
            {
              name: "task-disabled",
              dependencies: [],
              disabled: true,
            },
            {
              name: "task-enabled",
              dependencies: [],
              disabled: false,
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false }),
    })

    const providers = await garden.resolveProviders()

    const expectedModuleConfigs = (await garden.resolveModules({ log, includeDisabled: true })).map((m) => m._config)

    const config = {
      environmentName: garden.environmentName,
      providers,
      variables: garden.variables,
      moduleConfigs: expectedModuleConfigs,
      projectRoot: garden.projectRoot,
      projectId: "test-project-id",
    }

    expect(res.result).to.deep.equal(config)
  })

  it("should include disabled test configs", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetConfigCommand()

    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        name: "enabled",
        include: [],
        outputs: {},
        path: garden.projectRoot,
        serviceConfigs: [],
        taskConfigs: [],
        spec: {
          services: [
            {
              name: "service",
              dependencies: [],
              disabled: false,
              spec: {},
            },
          ],
          tasks: [
            {
              name: "task-enabled",
              dependencies: [],
              disabled: false,
            },
          ],
          tests: [
            {
              name: "test-enabled",
              dependencies: [],
              disabled: false,
            },
            {
              name: "test-disabled",
              dependencies: [],
              disabled: true,
            },
          ],
        },
        testConfigs: [],
        type: "test",
      },
    ])

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "exclude-disabled": false }),
    })

    const providers = await garden.resolveProviders()

    const expectedModuleConfigs = (await garden.resolveModules({ log, includeDisabled: true })).map((m) => m._config)

    const config = {
      environmentName: garden.environmentName,
      providers,
      variables: garden.variables,
      moduleConfigs: expectedModuleConfigs,
      projectRoot: garden.projectRoot,
      projectId: "test-project-id",
    }

    expect(res.result).to.deep.equal(config)
  })

  context("--exclude-disabled", () => {
    it("should exclude disabled module configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log
      const command = new GetConfigCommand()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: true,
          name: "a-disabled",
          include: [],
          outputs: {},
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          include: [],
          name: "b-enabled",
          outputs: {},
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true }),
      })

      const providers = await garden.resolveProviders()

      const expectedModuleConfigs = sortBy(await garden.resolveModules({ log }), "name").map((m) => m._config)

      const config = {
        environmentName: garden.environmentName,
        providers,
        variables: garden.variables,
        moduleConfigs: expectedModuleConfigs,
        projectRoot: garden.projectRoot,
        projectId: "test-project-id",
      }

      expect(expectedModuleConfigs.length).to.equal(1)
      expect(config).to.deep.equal(res.result)
    })

    it("should exclude disabled service configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log
      const command = new GetConfigCommand()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "enabled",
          include: [],
          outputs: {},
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-disabled",
                dependencies: [],
                disabled: true,
                hotReloadable: false,
                spec: {},
              },
              {
                name: "service-enabled",
                dependencies: [],
                disabled: false,
                hotReloadable: false,
                spec: {},
              },
            ],
            tasks: [
              {
                name: "task-enabled",
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true }),
      })

      const providers = await garden.resolveProviders()

      const expectedModuleConfigs = (await garden.resolveModules({ log })).map((m) => m._config)
      // Remove the disabled service
      expectedModuleConfigs[0].serviceConfigs = [
        {
          name: "service-enabled",
          dependencies: [],
          disabled: false,
          sourceModuleName: undefined,
          spec: {
            name: "service-enabled",
            dependencies: [],
            disabled: false,
            hotReloadable: false,
            spec: {},
            annotations: {},
            daemon: false,
            ingresses: [],
            env: {},
            limits: {
              cpu: 1000,
              memory: 1024,
            },
            ports: [],
            volumes: [],
          },
          hotReloadable: false,
        },
      ]

      const config = {
        environmentName: garden.environmentName,
        providers,
        variables: garden.variables,
        moduleConfigs: expectedModuleConfigs,
        projectRoot: garden.projectRoot,
        projectId: "test-project-id",
      }

      expect(config).to.deep.equal(res.result)
    })

    it("should exclude disabled task configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log
      const command = new GetConfigCommand()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "enabled",
          include: [],
          outputs: {},
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
            tasks: [
              {
                name: "task-disabled",
                dependencies: [],
                disabled: true,
              },
              {
                name: "task-enabled",
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true }),
      })

      const providers = await garden.resolveProviders()

      const expectedModuleConfigs = (await garden.resolveModules({ log })).map((m) => m._config)
      // Remove the disabled task
      expectedModuleConfigs[0].taskConfigs = [
        {
          name: "task-enabled",
          cacheResult: true,
          dependencies: [],
          disabled: false,
          spec: {
            name: "task-enabled",
            cacheResult: true,
            dependencies: [],
            disabled: false,
            timeout: null,
            env: {},
            volumes: [],
          },
          timeout: null,
        },
      ]

      const config = {
        environmentName: garden.environmentName,
        providers,
        variables: garden.variables,
        moduleConfigs: expectedModuleConfigs,
        projectRoot: garden.projectRoot,
        projectId: "test-project-id",
      }

      expect(res.result).to.deep.equal(config)
    })

    it("should exclude disabled test configs", async () => {
      const garden = await makeTestGardenA()
      const log = garden.log
      const command = new GetConfigCommand()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "enabled",
          include: [],
          outputs: {},
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service",
                dependencies: [],
                disabled: false,
                spec: {},
              },
            ],
            tasks: [
              {
                name: "task-enabled",
                dependencies: [],
                disabled: false,
              },
            ],
            tests: [
              {
                name: "test-enabled",
                dependencies: [],
                disabled: false,
              },
              {
                name: "test-disabled",
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const res = await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {},
        opts: withDefaultGlobalOpts({ "exclude-disabled": true }),
      })

      const providers = await garden.resolveProviders()

      const expectedModuleConfigs = (await garden.resolveModules({ log })).map((m) => m._config)
      // Remove the disabled task
      expectedModuleConfigs[0].testConfigs = [
        {
          name: "test-enabled",
          dependencies: [],
          disabled: false,
          spec: {
            name: "test-enabled",
            dependencies: [],
            disabled: false,
            timeout: null,
            env: {},
            volumes: [],
          },
          timeout: null,
        },
      ]

      const config = {
        environmentName: garden.environmentName,
        providers,
        variables: garden.variables,
        moduleConfigs: expectedModuleConfigs,
        projectRoot: garden.projectRoot,
        projectId: "test-project-id",
      }

      expect(res.result).to.deep.equal(config)
    })
  })
})
