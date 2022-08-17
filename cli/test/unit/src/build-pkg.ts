/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getTarballFilename, getZipFilename } from "../../../src/build-pkg"

describe("build-pkg", () => {
  const version = "0.12.44"
  const errorMsg = (errDetails: string): string => {
    return `The format of the release package name SHOULD NOT be changed since other tools we use depend on it, unless you absolutely know what you're doing. Test failed with error: ${errDetails}`
  }

  context("tarball-filenames", () => {
    const errorDetails = "Tarball filename must be in kebab-case format `garden-${version}-${platform}.tar.gz`."

    function expectTarballFilenameFormat(platformName: string) {
      const tarballFilename = getTarballFilename(version, platformName)
      expect(tarballFilename).to.equal(`garden-${version}-${platformName}.tar.gz`, errorMsg(errorDetails))
    }

    it("ensure filename format for tar packages", async () => {
      expectTarballFilenameFormat("alpine-amd64")
    })
  })

  context("zip-filenames", () => {
    const errorDetails = "ZIP filename must be in kebab-case format `garden-${version}-${platform}.zip`."

    function expectZipFilenameFormat(platformName: string) {
      const tarballFilename = getZipFilename(version, platformName)
      expect(tarballFilename).to.equal(`garden-${version}-${platformName}.zip`, errorMsg(errorDetails))
    }

    it("ensure filename format for alpine package", async () => {
      expectZipFilenameFormat("windows-amd64")
    })
  })
})
