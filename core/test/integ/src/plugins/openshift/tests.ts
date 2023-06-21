/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DeleteEnvironmentCommand } from "../../../../../src/commands/delete"
import { DeployCommand } from "../../../../../src/commands/deploy"
import { LogsCommand } from "../../../../../src/commands/logs"
import { ValidateCommand } from "../../../../../src/commands/validate"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers"
import { defaultDeployOpts } from "../../../../unit/src/commands/deploy"

describe("OpenShift", () => {
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
      opts: withDefaultGlobalOpts({}),
    })
  })

  it("should deploy a container", async () => {
    const command = new DeployCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["nginx-hello"],
      },
      opts: defaultDeployOpts,
    })
    expect(result!.success)
  })

  it("should get logs", async () => {
    const command = new LogsCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {
        names: ["nginx-hello"],
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

  it("should delete container deploy", async () => {
    const command = new DeleteEnvironmentCommand()
    const { result } = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "dependants-first": false }),
    })
    expect(result!.deployStatuses["nginx-hello"].state === "ready")
  })
})
