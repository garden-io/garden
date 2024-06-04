/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mutagenCliSpecLegacy, mutagenCliSpecNative, mutagenFauxSshSpec } from "../../../src/mutagen.js"
import { kubectlSpec } from "../../../src/plugins/kubernetes/kubectl.js"
import { kustomize4Spec, kustomize5Spec } from "../../../src/plugins/kubernetes/kubernetes-type/kustomize.js"
import { helm3Spec } from "../../../src/plugins/kubernetes/helm/helm-cli.js"
import { downloadBinariesAndVerifyHashes } from "../../../src/util/testing.js"
import { dockerSpec, namespaceCliSpec } from "../../../src/plugins/container/container.js"

describe("Docker binaries", () => {
  downloadBinariesAndVerifyHashes([dockerSpec])
})

describe("NamespaceCLI binaries", () => {
  downloadBinariesAndVerifyHashes([namespaceCliSpec])
})

describe("Mutagen binaries", () => {
  downloadBinariesAndVerifyHashes([mutagenCliSpecNative(), mutagenCliSpecLegacy()])
})

describe("Mutagen faux SSH binaries", () => {
  downloadBinariesAndVerifyHashes([mutagenFauxSshSpec])
})

describe("Kubectl binaries", () => {
  downloadBinariesAndVerifyHashes([kubectlSpec])
})

describe("Kustomize binaries", () => {
  describe("Version 4", () => {
    downloadBinariesAndVerifyHashes([kustomize4Spec])
  })

  describe("Version 5", () => {
    downloadBinariesAndVerifyHashes([kustomize5Spec])
  })
})

describe("Helm binaries", () => {
  downloadBinariesAndVerifyHashes([helm3Spec])
})
