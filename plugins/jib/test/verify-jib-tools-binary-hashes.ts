/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { downloadBinariesAndVerifyHashes } from "@garden-io/core/build/src/util/testing.js"
import { gradleSpec } from "../src/gradle.js"
import { mavenSpec } from "../src/maven.js"
import { mavendSpec } from "../src/mavend.js"
import { openJdkSpecs } from "../src/openjdk.js"

describe("Jib binaries", () => {
  describe("Gradle binaries", () => {
    downloadBinariesAndVerifyHashes([gradleSpec])
  })

  describe("Maven binaries", () => {
    downloadBinariesAndVerifyHashes([mavenSpec])
  })

  describe("Mavend binaries", () => {
    downloadBinariesAndVerifyHashes([mavendSpec])
  })

  describe("JDK binaries", () => {
    downloadBinariesAndVerifyHashes(openJdkSpecs)
  })
})
