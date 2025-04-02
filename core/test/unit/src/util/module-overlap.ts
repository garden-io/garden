/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import type { ModuleOverlap } from "../../../../src/util/module-overlap.js"
import { detectModuleOverlap } from "../../../../src/util/module-overlap.js"
import type { ModuleConfig } from "../../../../src/config/module.js"

describe("detectModuleOverlap", () => {
  const projectRoot = join("/", "user", "code")
  const gardenDirPath = join(projectRoot, ".garden")

  context("for homogenous overlaps of ModuleOverlapType = 'path'", () => {
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
      const expectedOverlaps: ModuleOverlap[] = [
        {
          config: moduleA,
          overlaps: [moduleB],
          type: "path",
          generateFilesOverlaps: undefined,
        },
        {
          config: moduleA,
          overlaps: [moduleC],
          type: "path",
          generateFilesOverlaps: undefined,
        },
        {
          config: moduleB,
          overlaps: [moduleC],
          type: "path",
          generateFilesOverlaps: undefined,
        },
      ]
      expect(
        detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB, moduleC, moduleD] })
      ).to.eql(expectedOverlaps)
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
      const expectedOverlaps: ModuleOverlap[] = [
        {
          config: moduleA,
          overlaps: [moduleB],
          type: "path",
          generateFilesOverlaps: undefined,
        },
        {
          config: moduleA,
          overlaps: [moduleC],
          type: "path",
          generateFilesOverlaps: undefined,
        },
        {
          config: moduleB,
          overlaps: [moduleC],
          type: "path",
          generateFilesOverlaps: undefined,
        },
      ]
      expect(
        detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB, moduleC, moduleD] })
      ).to.eql(expectedOverlaps)
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
        const expectedOverlaps: ModuleOverlap[] = [
          {
            config: moduleB,
            overlaps: [moduleA],
            type: "path",
            generateFilesOverlaps: undefined,
          },
        ]
        expect(
          detectModuleOverlap({
            projectRoot,
            gardenDirPath,
            moduleConfigs: [moduleA, moduleB],
          })
        ).to.eql(expectedOverlaps)
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
        const expectedOverlaps: ModuleOverlap[] = [
          {
            config: moduleB,
            overlaps: [moduleA],
            type: "path",
            generateFilesOverlaps: undefined,
          },
        ]
        expect(
          detectModuleOverlap({
            projectRoot,
            gardenDirPath,
            moduleConfigs: [moduleA, moduleB],
          })
        ).to.eql(expectedOverlaps)
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
        const expectedOverlapsA1B1: ModuleOverlap[] = [
          {
            config: moduleA1,
            overlaps: [moduleB1],
            type: "path",
            generateFilesOverlaps: undefined,
          },
        ]
        expect(
          detectModuleOverlap({
            projectRoot,
            gardenDirPath,
            moduleConfigs: [moduleA1, moduleB1],
          })
        ).to.eql(expectedOverlapsA1B1)
        const expectedOverlapsA2B2: ModuleOverlap[] = [
          {
            config: moduleA2,
            overlaps: [moduleB2],
            type: "path",
            generateFilesOverlaps: undefined,
          },
        ]
        expect(
          detectModuleOverlap({
            projectRoot,
            gardenDirPath,
            moduleConfigs: [moduleA2, moduleB2],
          })
        ).to.eql(expectedOverlapsA2B2)
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

  context("for homogeneous overlaps of ModuleOverlapType = 'generateFiles'", () => {
    it("should detect if modules have the same resolved path in generateFiles[].targetPath", () => {
      const path = join(projectRoot, "foo")
      const sourcePath = "manifests.yml"
      const targetPath = "./.manifests/manifests.yaml"

      // here we use include to avoid errors on intersecting module paths
      const moduleA = {
        name: "module-a",
        path,
        include: [""],
        generateFiles: [{ sourcePath, targetPath, resolveTemplates: true }],
      } as ModuleConfig

      const moduleB = {
        name: "module-b",
        path,
        include: [""],
        generateFiles: [{ sourcePath, targetPath, resolveTemplates: true }],
      } as ModuleConfig

      const expectedGenerateFilesOverlaps = [join(path, targetPath)]
      const expectedOverlaps: ModuleOverlap[] = [
        {
          config: moduleA,
          overlaps: [moduleB],
          type: "generateFiles",
          generateFilesOverlaps: expectedGenerateFilesOverlaps,
        },
      ]
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.eql(
        expectedOverlaps
      )
    })
  })

  context("for heterogeneous overlaps of mixed ModuleOverlapType", () => {
    it("should detect different kinds of overlaps", () => {
      const path = join(projectRoot, "foo")
      const sourcePath = "manifests.yml"
      const targetPath = "./.manifests/manifests.yaml"

      // here we use don't use include/exclude to get different types of module overlaps
      const moduleA = {
        name: "module-a",
        path,
        generateFiles: [{ sourcePath, targetPath, resolveTemplates: true }],
      } as ModuleConfig

      const moduleB = {
        name: "module-b",
        path,
        generateFiles: [{ sourcePath, targetPath, resolveTemplates: true }],
      } as ModuleConfig

      const expectedGenerateFilesOverlaps = [join(path, targetPath)]
      const expectedOverlaps: ModuleOverlap[] = [
        {
          config: moduleA,
          overlaps: [moduleB],
          type: "path",
          generateFilesOverlaps: undefined,
        },
        {
          config: moduleA,
          overlaps: [moduleB],
          type: "generateFiles",
          generateFilesOverlaps: expectedGenerateFilesOverlaps,
        },
      ]
      expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.eql(
        expectedOverlaps
      )
    })
  })
})
