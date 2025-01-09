/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import stripAnsi from "strip-ansi"
import type { ConfigContext } from "../../../../../src/config/template-contexts/base.js"
import { DefaultEnvironmentContext, ProjectConfigContext } from "../../../../../src/config/template-contexts/project.js"
import { resolveTemplateString } from "../../../../../src/template-string/template-string.js"
import { deline } from "../../../../../src/util/string.js"
import type { TestGarden } from "../../../../helpers.js"
import { freezeTime, makeTestGardenA } from "../../../../helpers.js"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues {
  [key: string]: TestValue
}

const vcsInfo = {
  branch: "main",
  commitHash: "abcdefgh",
  originUrl: "https://example.com/foo",
}

describe("DefaultEnvironmentContext", () => {
  let garden: TestGarden
  let c: DefaultEnvironmentContext
  let now: Date

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
  })

  beforeEach(() => {
    now = freezeTime()
    c = new DefaultEnvironmentContext(garden)
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.vcsInfo.branch,
    })
  })

  it("should resolve the current git commit hash", () => {
    expect(c.resolve({ key: ["git", "commitHash"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.vcsInfo.commitHash,
    })
  })

  it("should resolve the current git origin URL", () => {
    expect(c.resolve({ key: ["git", "originUrl"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.vcsInfo.originUrl,
    })
  })

  it("should resolve datetime.now to ISO datetime string", () => {
    expect(c.resolve({ key: ["datetime", "now"], nodePath: [], opts: {} })).to.eql({
      resolved: now.toISOString(),
    })
  })

  it("should resolve datetime.today to ISO datetime string", () => {
    expect(c.resolve({ key: ["datetime", "today"], nodePath: [], opts: {} })).to.eql({
      resolved: now.toISOString().slice(0, 10),
    })
  })

  it("should resolve datetime.timestamp to Unix timestamp in seconds", () => {
    expect(c.resolve({ key: ["datetime", "timestamp"], nodePath: [], opts: {} })).to.eql({
      resolved: Math.round(now.getTime() / 1000),
    })
  })
})

describe("ProjectConfigContext", () => {
  const enterpriseDomain = "https://garden.mydomain.com"

  it("should resolve local env variables", () => {
    process.env.TEST_VARIABLE = "value"
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "value",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the current git branch", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: "main",
    })
  })

  it("should resolve when logged in", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: { foo: "banana" },
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["secrets", "foo"], nodePath: [], opts: {} })).to.eql({
      resolved: "banana",
    })
  })

  context("errors thrown when a missing secret is referenced", () => {
    it("should ask the user to log in if they're logged out", () => {
      const c = new ProjectConfigContext({
        projectName: "some-project",
        projectRoot: "/tmp",
        artifactsPath: "/tmp",
        vcsInfo,
        username: "some-user",
        loggedIn: false, // <-----
        enterpriseDomain,
        secrets: { foo: "banana" },
        commandInfo: { name: "test", args: {}, opts: {} },
      })

      const { getUnavailableReason: message } = c.resolve({ key: ["secrets", "bar"], nodePath: [], opts: {} })

      expect(stripAnsi(message!())).to.match(/Please log in via the garden login command to use Garden with secrets/)
    })

    context("when logged in", () => {
      it("should notify the user if an empty set of secrets was returned by the backend", () => {
        const c = new ProjectConfigContext({
          projectName: "some-project",
          projectRoot: "/tmp",
          artifactsPath: "/tmp",
          vcsInfo,
          username: "some-user",
          loggedIn: true,
          enterpriseDomain,
          secrets: {}, // <-----
          commandInfo: { name: "test", args: {}, opts: {} },
        })

        const { getUnavailableReason: message } = c.resolve({ key: ["secrets", "bar"], nodePath: [], opts: {} })

        const errMsg = deline`
          Looks like no secrets have been created for this project and/or environment in Garden Cloud.
          To create secrets, please visit ${enterpriseDomain} and navigate to the secrets section for this project.
        `
        expect(stripAnsi(message!())).to.match(new RegExp(errMsg))
      })

      it("if a non-empty set of secrets was returned by the backend, provide a helpful suggestion", () => {
        const c = new ProjectConfigContext({
          projectName: "some-project",
          projectRoot: "/tmp",
          artifactsPath: "/tmp",
          vcsInfo,
          username: "some-user",
          loggedIn: true,
          enterpriseDomain,
          secrets: { foo: "banana " }, // <-----
          commandInfo: { name: "test", args: {}, opts: {} },
        })

        const { getUnavailableReason: message } = c.resolve({ key: ["secrets", "bar"], nodePath: [], opts: {} })

        const errMsg = deline`
          Please make sure that all required secrets for this project exist in Garden Cloud, and are accessible in this
          environment.
        `
        expect(stripAnsi(message!())).to.match(new RegExp(errMsg))
      })
    })
  })

  it("should return helpful message when resolving missing env variable", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    const key = "fiaogsyecgbsjyawecygaewbxrbxajyrgew"

    const { getUnavailableReason: message } = c.resolve({ key: ["local", "env", key], nodePath: [], opts: {} })

    expect(stripAnsi(message!())).to.match(
      /Could not find key fiaogsyecgbsjyawecygaewbxrbxajyrgew under local.env. Available keys: /
    )
  })

  it("should resolve the local arch", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["local", "arch"], nodePath: [], opts: {} })).to.eql({
      resolved: process.arch,
    })
  })

  it("should resolve the local platform", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the local username (both regular and lower case versions)", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "SomeUser",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["local", "username"], nodePath: [], opts: {} })).to.eql({
      resolved: "SomeUser",
    })
    expect(c.resolve({ key: ["local", "usernameLowerCase"], nodePath: [], opts: {} })).to.eql({
      resolved: "someuser",
    })
  })

  it("should resolve the command name", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "SomeUser",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })
    expect(c.resolve({ key: ["command", "name"], nodePath: [], opts: {} })).to.eql({
      resolved: "test",
    })
  })

  it("should resolve command params (positive)", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "SomeUser",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "deploy", args: {}, opts: { sync: ["my-service"] } },
    })

    const result = resolveTemplateString({
      string: "${command.name == 'deploy' && (command.params.sync contains 'my-service')}",
      context: c,
    })
    expect(result).to.be.true
  })

  it("should resolve command params (negative)", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      vcsInfo,
      username: "SomeUser",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo: { name: "test", args: {}, opts: {} },
    })

    const result = resolveTemplateString({
      string: "${command.params contains 'sync' && command.params.sync contains 'my-service'}",
      context: c,
    })
    expect(result).to.be.false
  })
})
