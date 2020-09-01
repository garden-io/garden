/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectError } from "@garden-io/sdk/testing"
import { expect } from "chai"
import { detectProjectType, getBuildFlags } from "../util"

describe("util", () => {
  describe("detectProjectType", () => {
    it("returns gradle if module files include a gradle config", () => {
      const module: any = {
        path: "/foo",
        version: {
          files: ["/foo/build.gradle"],
        },
      }
      expect(detectProjectType(module)).to.equal("gradle")
    })

    it("returns maven if module files include a maven config", () => {
      const module: any = {
        path: "/foo",
        version: {
          files: ["/foo/pom.xml"],
        },
      }
      expect(detectProjectType(module)).to.equal("maven")
    })

    it("throws if no maven or gradle config is in the module file list", () => {
      const module: any = {
        name: "foo",
        path: "/foo",
        version: {
          files: [],
        },
      }
      expectError(
        () => detectProjectType(module),
        (err) => expect(err.message).to.equal("Could not detect a gradle or maven project to build module foo")
      )
    })
  })

  describe("getBuildFlags", () => {
    it("correctly sets default build flags", () => {
      const imageId = "foo:abcdef"
      const versionString = "abcdef"

      const module: any = {
        name: "foo",
        path: "/foo",
        build: {},
        outputs: {
          "local-image-id": imageId,
        },
        version: {
          versionString,
        },
        spec: {
          build: {},
          buildArgs: {},
        },
      }
      const { flags } = getBuildFlags(module, "gradle")

      const targetDir = "build"
      const basenameSuffix = "-foo-" + module.version.versionString

      expect(flags).to.eql([
        "-Djib.to.image=" + imageId,
        `-Djib.outputPaths.tar=${targetDir}/jib-image${basenameSuffix}.tar`,
        `-Djib.outputPaths.digest=${targetDir}/jib-image${basenameSuffix}.digest`,
        `-Djib.outputPaths.imageId=${targetDir}/jib-image${basenameSuffix}.id`,
        `-Djib.outputPaths.imageJson=${targetDir}/jib-image${basenameSuffix}.json`,
        "-Djib.container.args=GARDEN_MODULE_VERSION=" + versionString,
        "-Dstyle.color=always",
        "-Djansi.passthrough=true",
        "-Djib.console=plain",
      ])
    })

    it("sets target dir to target/ for maven projects", () => {
      const imageId = "foo:abcdef"
      const versionString = "abcdef"

      const module: any = {
        name: "foo",
        path: "/foo",
        build: {},
        outputs: {
          "local-image-id": imageId,
        },
        version: {
          versionString,
        },
        spec: {
          build: {},
          buildArgs: {},
        },
      }
      const { flags, tarPath } = getBuildFlags(module, "maven")

      expect(flags).to.include(`-Djib.outputPaths.tar=target/jib-image-foo-${module.version.versionString}.tar`)
      expect(tarPath).to.equal(`/foo/target/jib-image-foo-${module.version.versionString}.tar`)
    })

    it("adds extraFlags if set in module spec", () => {
      const versionString = "abcdef"

      const module: any = {
        name: "foo",
        path: "/foo",
        build: {},
        outputs: {},
        version: {
          versionString,
        },
        spec: {
          build: {},
          buildArgs: {},
          extraFlags: ["bloop"],
        },
      }

      const { flags } = getBuildFlags(module, "maven")
      expect(flags).to.include("bloop")
    })

    it("adds docker build args if set in module spec", () => {
      const versionString = "abcdef"

      const module: any = {
        name: "foo",
        path: "/foo",
        build: {},
        outputs: {},
        version: {
          versionString,
        },
        spec: {
          build: {},
          buildArgs: {
            foo: "bar",
          },
        },
      }

      const { flags } = getBuildFlags(module, "maven")

      expect(flags).to.include("-Djib.container.args=GARDEN_MODULE_VERSION=" + versionString + ",foo=bar")
    })

    it("sets OCI tar format if tarOnly and tarFormat=oci are set", () => {
      const versionString = "abcdef"

      const module: any = {
        name: "foo",
        path: "/foo",
        build: {},
        outputs: {},
        version: {
          versionString,
        },
        spec: {
          build: {
            tarOnly: true,
            tarFormat: "oci",
          },
          buildArgs: {
            foo: "bar",
          },
        },
      }

      const { flags } = getBuildFlags(module, "maven")

      expect(flags).to.include("-Djib.container.format=OCI")
    })
  })
})
