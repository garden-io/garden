/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type tmp from "tmp-promise"
import type { ProjectConfig } from "../../../../../../src/config/project.js"
import { execa } from "execa"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../../../src/constants.js"
import { expect } from "chai"
import { TestGarden, makeTempDir, createProjectConfig } from "../../../../../helpers.js"
import { DeployTask } from "../../../../../../src/tasks/deploy.js"
import { isSubset } from "../../../../../../src/util/is-subset.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"

describe("configmap module", () => {
  let tmpDir: tmp.DirectoryResult
  let projectConfigFoo: ProjectConfig

  before(async () => {
    tmpDir = await makeTempDir()

    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })

    projectConfigFoo = createProjectConfig({
      path: tmpDir.path,
      providers: [{ name: "local-kubernetes", namespace: "default" }],
    })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  it("should successfully deploy a simple ConfigMap", async () => {
    const garden = await TestGarden.factory(tmpDir.path, {
      plugins: [],
      config: projectConfigFoo,
    })

    const data = {
      foo: "bar",
    }

    garden.setModuleConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "test",
        type: "configmap",
        allowPublish: false,
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        disabled: false,
        path: tmpDir.path,
        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
        spec: {
          data,
        },
      },
    ])

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction({ action: graph.getDeploy("test"), log: garden.log, graph })

    const deployTask = new DeployTask({
      garden,
      graph,
      log: garden.log,
      action,
      force: true,
      forceBuild: false,
    })

    await garden.processTasks({ tasks: [deployTask], throwOnError: true })

    const actions = await garden.getActionRouter()
    const status = await actions.getDeployStatuses({
      log: garden.log,
      graph,
    })

    const remoteResources = status.test.detail?.detail.remoteResources

    expect(status.test.state === "ready")
    expect(remoteResources.length).to.equal(1)
    expect(
      isSubset(remoteResources[0], {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: { name: "test", namespace: "default" },
        data,
      })
    ).to.be.true

    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })
    await actions.deploy.delete({ log: actionLog, action, graph })
  })
})
