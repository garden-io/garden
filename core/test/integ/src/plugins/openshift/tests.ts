/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DeleteEnvironmentCommand } from "../../../../../src/commands/delete.js"
import { DeployCommand } from "../../../../../src/commands/deploy.js"
import { LogsCommand } from "../../../../../src/commands/logs.js"
import { ValidateCommand } from "../../../../../src/commands/validate.js"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers.js"
import { defaultDeployOpts } from "../../../../unit/src/commands/deploy.js"
import { BuildCommand } from "../../../../../src/commands/build.js"
import { TestCommand } from "../../../../../src/commands/test.js"

describe.skip("OpenShift", () => {
  const projectRoot = getDataDir("openshift", "demo-project")
  let garden
  let log

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot)
    log = garden.log
  })

  it("should pass validation", async () => {
    const command = new ValidateCommand()
    await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ resolve: undefined }),
    })
  })

  it("should build a container", async () => {
    const command = new BuildCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["openshift-nginx-hello"],
      },
      opts: withDefaultGlobalOpts({ "watch": false, "force": true, "with-dependants": false }),
    })
    expect(result!.success).to.be.true
  })

  it("should deploy a container", async () => {
    const command = new DeployCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["openshift-nginx-hello"],
      },
      opts: defaultDeployOpts,
    })
    expect(result!.success).to.be.true
  })

  it("should get logs", async () => {
    const command = new LogsCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["openshift-nginx-hello"],
      },
      opts: withDefaultGlobalOpts({
        "log-level": "info",
        "since": "60s",
        "tail": 0,
        "follow": false,
        "tag": undefined,
        "show-tags": false,
        "timestamps": false,
        "hide-name": false,
      }),
    })
    // the openshift nginx container image does not produce logs correctly,
    // but this should ensure the logs command at least runs successfully
    expect(result).to.deep.eq([])
  })

  it("should pass tests", async () => {
    const command = new TestCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["cat", "curl"],
      },
      opts: withDefaultGlobalOpts({
        "name": undefined,
        "module": undefined,
        "force": true,
        "force-build": false,
        "interactive": false,
        "watch": false,
        "skip": [],
        "skip-dependencies": false,
        "logger-type": "ink",
        "log-level": "info",
        "silent": false,
        "skip-dependants": false,
      }),
    })
    expect(result!.success).to.be.true
  })

  it("should delete container deploy", async () => {
    const command = new DeleteEnvironmentCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "dependants-first": false, "force": false }),
    })
    expect(result!.deployStatuses["openshift-nginx-hello"].state).eql("ready")
  })
})
