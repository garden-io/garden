/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import type { TempDirectory, TestGarden } from "../../../../../helpers.js"
import { makeModuleConfig, makeTempGarden } from "../../../../../helpers.js"
import type { Log } from "../../../../../../src/logger/log-entry.js"
import { gardenPlugin } from "../../../../../../src/plugins/container/container.js"
import type {
  ContainerModuleConfig,
  ContainerServiceSpec,
} from "../../../../../../src/plugins/container/moduleConfig.js"
import { defaultContainerResources } from "../../../../../../src/plugins/container/moduleConfig.js"
import { actionReferenceToString } from "../../../../../../src/actions/base.js"

describe("kubernetes container module conversion", () => {
  let tmpDir: TempDirectory
  let garden: TestGarden
  let log: Log
  let graph: ConfigGraph

  before(async () => {
    const result = await makeTempGarden({ plugins: [gardenPlugin()] })
    tmpDir = result.tmpDir
    garden = result.garden
    log = garden.log
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  it("should include build dependencies among converted runtime actions' dependencies", async () => {
    garden.setPartialModuleConfigs([
      makeModuleConfig<ContainerModuleConfig>(garden.projectRoot, {
        name: "test-image",
        type: "container",
        variables: {},
        spec: {
          build: {
            timeout: 300,
          },
          buildArgs: {},
          extraFlags: [],
          dockerfile: "foo.dockerfile",
          services: [],
          tests: [],
          tasks: [],
        },
      }),
      makeModuleConfig<ContainerModuleConfig>(garden.projectRoot, {
        name: "test-deploy",
        type: "container",
        variables: {},
        build: {
          timeout: 300,
          dependencies: [
            {
              name: "test-image",
              copy: [],
            },
          ],
        },
        spec: {
          build: {
            timeout: 300,
          },
          buildArgs: {},
          extraFlags: [],
          dockerfile: "foo.dockerfile",
          services: [
            {
              ...dummyContainerServiceSpec,
              name: "test-deploy",
            },
          ],
          tests: [],
          tasks: [],
        },
      }),
    ])
    graph = await garden.getConfigGraph({ log, emit: false })
    const testDeploy = graph.getDeploy("test-deploy")
    const deployDeps = testDeploy.getDependencyReferences().map(actionReferenceToString)
    expect(deployDeps.sort()).to.eql(["build.test-deploy", "build.test-image"])
  })
})

const dummyContainerServiceSpec: ContainerServiceSpec = {
  name: "service-a",
  annotations: {},
  args: ["echo"],
  dependencies: [],
  daemon: false,
  disabled: false,
  ingresses: [
    {
      annotations: {},
      path: "/",
      port: "http",
    },
  ],
  env: {
    SOME_ENV_VAR: "value",
  },
  healthCheck: {
    httpGet: {
      path: "/health",
      port: "http",
    },
    livenessTimeoutSeconds: 10,
    readinessTimeoutSeconds: 10,
  },
  limits: {
    cpu: 123,
    memory: 456,
  },
  cpu: defaultContainerResources.cpu,
  memory: defaultContainerResources.memory,
  ports: [
    {
      name: "http",
      protocol: "TCP",
      containerPort: 8080,
      servicePort: 8080,
    },
  ],
  replicas: 1,
  volumes: [],
  deploymentStrategy: "RollingUpdate",
}
