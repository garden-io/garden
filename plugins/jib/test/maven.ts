/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolveMavenPhases } from "../maven"
import { expect } from "chai"

describe("maven", () => {
  describe("resolveMavenPhases", () => {
    it('should return mvn "compile" phase if no mavenPhases are defined', () => {
      const mavenPhases = resolveMavenPhases()
      expect(mavenPhases).to.eql(["compile"])
    })

    it('should return mvn "compile" phase if mavenPhases is an empty array', () => {
      const mavenPhases = resolveMavenPhases([])
      expect(mavenPhases).to.eql(["compile"])
    })

    it("should return a single mvn phase defined in mavenPhases", () => {
      const mavenPhases = resolveMavenPhases(["package"])
      expect(mavenPhases).to.eql(["package"])
    })

    it("should return multiple mvn phases defined in mavenPhases", () => {
      const mavenPhases = resolveMavenPhases(["clean", "package"])
      expect(mavenPhases).to.eql(["clean", "package"])
    })
  })
})
