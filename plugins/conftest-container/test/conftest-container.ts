/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"

import { createGardenPlugin } from "@garden-io/sdk"
import { defaultApiVersion } from "@garden-io/sdk/constants"
import { makeTestGarden } from "@garden-io/sdk/testing"
import { gardenPlugin } from ".."
import { gardenPlugin as conftestPlugin } from "@garden-io/garden-conftest"

import { ProjectConfig, defaultNamespace } from "@garden-io/core/build/src/config/project"

describe("conftest-container provider", () => {
  const projectRoot = join(__dirname, "test-project")

  const projectConfig: ProjectConfig = {
    apiVersion: defaultApiVersion,
    kind: "Project",
    name: "test",
    path: projectRoot,
    defaultEnvironment: "default",
    dotIgnoreFiles: [],
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "conftest-container", policyPath: "dockerfile.rego" }],
    variables: {},
  }

  it("should add a conftest module for each container module with a Dockerfile", async () => {
    const garden = await makeTestGarden(projectRoot, {
      plugins: [gardenPlugin, conftestPlugin],
      config: projectConfig,
    })

    const graph = await garden.getConfigGraph(garden.log)
    const containerModule = graph.getModule("container")
    const module = graph.getModule("conftest-container")

    expect(module.path).to.equal(containerModule.path)
    expect(module.spec).to.eql({
      build: { dependencies: [] },
      files: ["Dockerfile"],
      namespace: "main",
      combine: false,
      policyPath: "dockerfile.rego",
    })
  })

  it("should add a conftest module for module types inheriting from container", async () => {
    const foo = createGardenPlugin({
      name: "foo",
      dependencies: ["container"],
      createModuleTypes: [
        {
          name: "foo",
          base: "container",
          docs: "foo",
          handlers: {},
        },
      ],
    })

    const garden = await makeTestGarden(projectRoot, {
      plugins: [gardenPlugin, conftestPlugin, foo],
      config: {
        ...projectConfig,
        providers: [...projectConfig.providers, { name: "foo" }],
      },
    })

    let graph = await garden.getConfigGraph(garden.log)
    const containerModule = graph.getModule("container")

    garden["moduleConfigs"] = {
      foo: {
        apiVersion: defaultApiVersion,
        name: "foo",
        type: "foo",
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
                path: containerModule.path,
        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
        spec: { dockerfile: "Dockerfile" },
      },
    }

    graph = await garden.getConfigGraph(garden.log)
    const module = graph.getModule("conftest-foo")

    expect(module.path).to.equal(projectRoot)
    expect(module.spec).to.eql({
      build: { dependencies: [] },
      files: ["Dockerfile"],
      namespace: "main",
      combine: false,
      policyPath: "dockerfile.rego",
    })
  })
})
