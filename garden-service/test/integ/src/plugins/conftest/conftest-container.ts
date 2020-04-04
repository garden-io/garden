/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ProjectConfig } from "../../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { Garden } from "../../../../../src/garden"
import { getDataDir } from "../../../../helpers"
import { expect } from "chai"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"

describe("conftest-container provider", () => {
  const projectRoot = getDataDir("test-projects", "conftest-container")
  const projectConfig: ProjectConfig = {
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: projectRoot,
    defaultEnvironment: "default",
    dotIgnoreFiles: [],
    environments: [{ name: "default", variables: {} }],
    providers: [{ name: "conftest-container", policyPath: "dockerfile.rego" }],
    variables: {},
  }

  it("should add a conftest module for each container module with a Dockerfile", async () => {
    const garden = await Garden.factory(projectRoot, {
      plugins: [],
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

    const garden = await Garden.factory(projectRoot, {
      plugins: [foo],
      config: {
        ...projectConfig,
        providers: [...projectConfig.providers, { name: "foo" }],
      },
    })

    let graph = await garden.getConfigGraph(garden.log)
    const containerModule = graph.getModule("container")

    garden["moduleConfigs"] = {
      foo: {
        apiVersion: DEFAULT_API_VERSION,
        name: "foo",
        type: "foo",
        allowPublish: false,
        build: { dependencies: [] },
        disabled: false,
        outputs: {},
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
      policyPath: "dockerfile.rego",
    })
  })
})
