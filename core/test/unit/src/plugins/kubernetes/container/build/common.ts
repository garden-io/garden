/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { skopeoManifestUnknown } from "../../../../../../../src/plugins/kubernetes/container/build/common"
import { expect } from "chai"

describe("common build", () => {
  describe("manifest error", () => {
    it("should result in manifest unknown for common registry error", () => {
      const errorMessage = "ERROR: manifest unknown: manifest unknown"

      expect(skopeoManifestUnknown(errorMessage)).to.be.true
    })

    it("should result in manifest unknown for Harbor registry error", () => {
      const errorMessage =
        'Unable to query registry for image status: time="2021-10-13T17:50:25Z" level=fatal msg="Error parsing image name "docker://registry.domain/namespace/image-name:v-1f160eadbb": Error reading manifest v-1f160eadbb in registry.domain/namespace/image-name: unknown: artifact namespace/image-name:v-1f160eadbb not found"'

      expect(skopeoManifestUnknown(errorMessage)).to.be.true
    })

    it("should result in manifest not unknown for other errors", () => {
      const errorMessage =
        "unauthorized: unauthorized to access repository: namespace/image-name, action: push: unauthorized to access repository: namespace/image-name, action: push"

      expect(skopeoManifestUnknown(errorMessage)).to.be.false
    })
  })
})
