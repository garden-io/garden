/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  KubernetesTargetResourceSpec,
  ServiceResourceSpec,
} from "../../../../../../src/plugins/kubernetes/config.js"
import { convertServiceResourceSpec } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common.js"
import { expect } from "chai"

describe("convertServiceResource", () => {
  const moduleName = "module-a"

  it("picks kind and name if podSelector is not defined", async () => {
    const serviceResourceSpec: ServiceResourceSpec = {
      kind: "Deployment",
      name: "service-a",
    }

    const kubernetesResourceSpec = convertServiceResourceSpec(serviceResourceSpec, moduleName)
    const expectedKubernetesResourceSpec: KubernetesTargetResourceSpec = {
      kind: "Deployment",
      name: "service-a",
    }
    expect(kubernetesResourceSpec).to.eql(expectedKubernetesResourceSpec)
  })

  it("picks kind and name if podSelector is empty", async () => {
    const serviceResourceSpec: ServiceResourceSpec = {
      kind: "Deployment",
      name: "service-a",
      podSelector: {},
    }

    const kubernetesResourceSpec = convertServiceResourceSpec(serviceResourceSpec, moduleName)
    const expectedKubernetesResourceSpec: KubernetesTargetResourceSpec = {
      kind: "Deployment",
      name: "service-a",
    }
    expect(kubernetesResourceSpec).to.eql(expectedKubernetesResourceSpec)
  })

  it("picks podSelector instead of kind and name if podSelector is not empty", async () => {
    const serviceResourceSpec: ServiceResourceSpec = {
      kind: "Deployment",
      name: "service-a",
      podSelector: {
        app: "app-service-a",
      },
    }

    const kubernetesResourceSpec = convertServiceResourceSpec(serviceResourceSpec, moduleName)
    const expectedKubernetesResourceSpec: KubernetesTargetResourceSpec = {
      podSelector: {
        app: "app-service-a",
      },
    }
    expect(kubernetesResourceSpec).to.eql(expectedKubernetesResourceSpec)
  })
})
