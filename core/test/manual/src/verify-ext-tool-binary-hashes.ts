/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mutagenCliSpec } from "../../../src/mutagen.js"
import { kubectlSpec } from "../../../src/plugins/kubernetes/kubectl.js"
import { kustomizeSpec } from "../../../src/plugins/kubernetes/kubernetes-type/kustomize.js"
import { helm3Spec } from "../../../src/plugins/kubernetes/helm/helm-cli.js"
import { downloadBinariesAndVerifyHashes } from "../../../src/util/testing.js"

describe("Mutagen binaries", () => {
  downloadBinariesAndVerifyHashes([mutagenCliSpec])
})

describe("Kubectl binaries", () => {
  downloadBinariesAndVerifyHashes([kubectlSpec])
})

describe("Kustomize binaries", () => {
  downloadBinariesAndVerifyHashes([kustomizeSpec])
})

describe("Helm binaries", () => {
  downloadBinariesAndVerifyHashes([helm3Spec])
})
