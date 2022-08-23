/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { CallCommand } from "../../../../src/commands/call"
import { expect } from "chai"
import { GardenPlugin, createGardenPlugin } from "../../../../src/plugin/plugin"
import nock = require("nock")
import { withDefaultGlobalOpts, dataDir, makeTestGarden } from "../../../helpers"
import { execTestActionSchema } from "../../../../src/plugins/exec/config"
import { ActionStatus } from "../../../../src/actions/base"

const testStatusesA: { [key: string]: ActionStatus } = {
  "service-a": {
    state: "ready",
    detail: {
      state: "ready",
      detail: {},
      ingresses: [
        {
          hostname: "service-a.test-project-b.local.app.garden",
          path: "/path-a",
          protocol: "http",
          port: 32000,
        },
      ],
    },
    outputs: {},
  },
  "service-b": {
    state: "ready",
    detail: {
      state: "ready",
      detail: {},
      ingresses: [
        {
          hostname: "service-b.test-project-b.local.app.garden",
          path: "/",
          port: 32000,
          protocol: "http",
        },
      ],
    },
    outputs: {},
  },
  "service-c": {
    state: "ready",
    detail: { state: "ready", detail: {} },
    outputs: {},
  },
}

const testStatusesB: { [key: string]: ActionStatus } = {
  "service-a": {
    state: "ready",
    detail: {
      state: "ready",
      detail: {},
      ingresses: [
        {
          hostname: "service-a.test-project-b.local.app.garden",
          linkUrl: "https://www.example.com",
          path: "/path-a",
          protocol: "http",
          port: 32000,
        },
      ],
    },
    outputs: {},
  },
  "service-b": {
    state: "ready",
    detail: {
      state: "ready",
      detail: {},
      ingresses: [
        {
          hostname: "service-b.test-project-b.local.app.garden",
          linkUrl: "https://www.example.com/hello",
          path: "/path-b",
          protocol: "http",
          port: 32000,
        },
      ],
    },
    outputs: {},
  },
}

// TODO-G2: use the actual value type of `serviceStatuses` instead of any
function makeTestProvider(serviceStatuses: { [key: string]: any }): GardenPlugin {
  return createGardenPlugin({
    name: "test-plugin",
    createActionTypes: {
      Test: [
        {
          name: "test",
          docs: "Test Test action",
          schema: execTestActionSchema(),
          handlers: {
            run: (params) => serviceStatuses[params.action.name] || {},
          },
        },
      ],
    },
  })
}

// TODO-G2: rename test cases to match the new graph model semantics
describe("commands.call", () => {
  const projectRootB = join(dataDir, "test-project-b")
  const pluginsA = [makeTestProvider(testStatusesA)]
  const pluginsB = [makeTestProvider(testStatusesB)]

  beforeEach(() => {
    nock.disableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it("should find the ingress for a service and call it with the specified path", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000").get("/path-a").reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { nameAndPath: "service-a/path-a" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result!.url).to.equal("http://service-a.test-project-b.local.app.garden:32000/path-a")
    expect(result!.deployName).to.equal("service-a")
    expect(result!.path).to.equal("/path-a")
    expect(result!.response.status).to.equal(200)
    expect(result!.response.data).to.equal("bla")
  })

  it("should default to the path '/' if that is exposed if no path is requested", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000").get("/path-a").reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { nameAndPath: "service-a" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result!.url).to.equal("http://service-a.test-project-b.local.app.garden:32000/path-a")
    expect(result!.deployName).to.equal("service-a")
    expect(result!.path).to.equal("/path-a")
    expect(result!.response.status).to.equal(200)
    expect(result!.response.data).to.equal("bla")
  })

  it("should otherwise use the first defined ingress if no path is requested", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    nock("http://service-b.test-project-b.local.app.garden:32000").get("/").reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { nameAndPath: "service-b" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result!.url).to.equal("http://service-b.test-project-b.local.app.garden:32000/")
    expect(result!.deployName).to.equal("service-b")
    expect(result!.path).to.equal("/")
    expect(result!.response.status).to.equal(200)
    expect(result!.response.data).to.equal("bla")
  })

  it("should use the linkUrl if provided", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsB })
    const log = garden.log
    const command = new CallCommand()

    nock("https://www.example.com").get("/").reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { nameAndPath: "service-a" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result!.url).to.equal("https://www.example.com")
    expect(result!.deployName).to.equal("service-a")
    expect(result!.path).to.equal("/")
    expect(result!.response.status).to.equal(200)
    expect(result!.response.data).to.equal("bla")
  })

  it("should return the path for linkUrl", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsB })
    const log = garden.log
    const command = new CallCommand()

    nock("https://www.example.com").get("/hello").reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { nameAndPath: "service-b/path-b" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result!.url).to.equal("https://www.example.com/hello")
    expect(result!.deployName).to.equal("service-b")
    expect(result!.path).to.equal("/hello")
    expect(result!.response.status).to.equal(200)
    expect(result!.response.data).to.equal("bla")
  })

  it("should error if service isn't running", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    try {
      await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { nameAndPath: "service-d/path-d" },
        opts: withDefaultGlobalOpts({}),
      })
    } catch (err) {
      expect(err.type).to.equal("runtime")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no ingresses", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    try {
      await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { nameAndPath: "service-c/path-c" },
        opts: withDefaultGlobalOpts({}),
      })
    } catch (err) {
      expect(err.type).to.equal("parameter")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no matching ingresses", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    try {
      await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { nameAndPath: "service-a/bla" },
        opts: withDefaultGlobalOpts({}),
      })
    } catch (err) {
      expect(err.type).to.equal("parameter")
      return
    }

    throw new Error("Expected error")
  })
})
