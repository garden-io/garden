/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { detectModuleOverlap } from "../../../../src/util/module-overlap"
import { ModuleConfig } from "../../../../src/config/module"

describe("detectModuleOverlap", () => {
  const projectRoot = join("/", "user", "code")
  const gardenDirPath = join(projectRoot, ".garden")

  it("should detect if modules have the same root", () => {
    const moduleA = {
      name: "module-a",
      path: join(projectRoot, "foo"),
    } as ModuleConfig
    const moduleB = {
      name: "module-b",
      path: join(projectRoot, "foo"),
    } as ModuleConfig
    const moduleC = {
      name: "module-c",
      path: join(projectRoot, "foo"),
    } as ModuleConfig
    const moduleD = {
      name: "module-d",
      path: join(projectRoot, "bas"),
    } as ModuleConfig
    expect(
      detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB, moduleC, moduleD] })
    ).to.eql([
      {
        module: moduleA,
        overlaps: [moduleB, moduleC],
      },
      {
        module: moduleB,
        overlaps: [moduleA, moduleC],
      },
      {
        module: moduleC,
        overlaps: [moduleA, moduleB],
      },
    ])
  })
  it("should detect if a module has another module in its path", () => {
    const moduleA = {
      name: "module-a",
      path: join(projectRoot, "foo"),
    } as ModuleConfig
    const moduleB = {
      name: "module-b",
      path: join(projectRoot, "foo", "bar"),
    } as ModuleConfig
    const moduleC = {
      name: "module-c",
      path: join(projectRoot, "foo", "bar", "bas"),
    } as ModuleConfig
    const moduleD = {
      name: "module-d",
      path: join(projectRoot, "bas", "bar", "bas"),
    } as ModuleConfig
    expect(
      detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB, moduleC, moduleD] })
    ).to.eql([
      {
        module: moduleA,
        overlaps: [moduleB, moduleC],
      },
      {
        module: moduleB,
        overlaps: [moduleC],
      },
    ])
  })

  context("same root", () => {
    it("should ignore modules that set includes", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
        include: [""],
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.eql([
        {
          module: moduleB,
          overlaps: [moduleA],
        },
      ])
    })
    it("should ignore modules that set excludes", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
        exclude: [""],
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.eql([
        {
          module: moduleB,
          overlaps: [moduleA],
        },
      ])
    })
    it("should ignore modules that are disabled", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
        disabled: true,
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.be.empty
    })
  })

  context("nested modules", () => {
    it("should ignore modules that set includes", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
        include: [""],
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo", "bar"),
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.be.empty
    })

    it("should ignore modules that set excludes", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
        exclude: [""],
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo", "bar"),
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.be.empty
    })

    it("should ignore modules that are disabled", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
        disabled: true,
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo", "bar"),
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.be.empty
    })

    it("should detect overlaps if only nested module has includes/excludes", () => {
      const moduleA1 = {
        name: "module-a",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      const moduleB1 = {
        name: "module-b",
        path: join(projectRoot, "foo", "bar"),
        include: [""],
      } as ModuleConfig
      const moduleA2 = {
        name: "module-a",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      const moduleB2 = {
        name: "module-b",
        path: join(projectRoot, "foo", "bar"),
        exclude: [""],
      } as ModuleConfig
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA1, moduleB1] })).to.eql([
        {
          module: moduleA1,
          overlaps: [moduleB1],
        },
      ])
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA2, moduleB2] })).to.eql([
        {
          module: moduleA2,
          overlaps: [moduleB2],
        },
      ])
    })

    it("should not consider remote source modules to overlap with module in project root", () => {
      const remoteModule = {
        name: "remote-module",
        path: join(gardenDirPath, "sources", "foo", "bar"),
      } as ModuleConfig

      const moduleFoo = {
        name: "module-foo",
        path: join(projectRoot, "foo"),
        include: [""],
      } as ModuleConfig

      expect(
        detectModuleOverlap({
          projectRoot,
          gardenDirPath,
          moduleConfigs: [moduleFoo, remoteModule],
        })
      ).to.eql([])
    })
  })
})
