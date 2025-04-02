/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { sortBy } from "lodash-es"
import {
  millicpuToString,
  kilobytesToString,
  flattenResources,
  deduplicatePodsByLabel,
  getStaticLabelsFromPod,
  getSelectorString,
  makePodName,
  matchSelector,
  isOctal,
} from "../../../../../src/plugins/kubernetes/util.js"
import type { KubernetesPod, KubernetesServerResource } from "../../../../../src/plugins/kubernetes/types.js"
import type { V1Pod } from "@kubernetes/client-node"
import { sleep } from "../../../../../src/util/util.js"

describe("deduplicatePodsByLabel", () => {
  it("should return a list of pods, unique by label so that the latest pod is kept", () => {
    const podA = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-12T14:44:26Z"),
        labels: {
          module: "a",
          service: "a",
        },
      },
      spec: {},
    } as unknown as KubernetesServerResource<V1Pod>
    const podADupe = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-11T14:44:26Z"), // This one is older than podA
        labels: {
          module: "a",
          service: "a",
        },
      },
    } as unknown as KubernetesServerResource<V1Pod>
    const podUndefinedLabelA = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-13T14:44:26Z"),
        labels: undefined,
      },
    } as unknown as KubernetesServerResource<V1Pod>
    const podUndefinedLabelB = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-14T14:44:26Z"),
        labels: undefined,
      },
    } as unknown as KubernetesServerResource<V1Pod>
    const podEmptyLabelA = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-15T14:44:26Z"),
        labels: {},
      },
    } as unknown as KubernetesServerResource<V1Pod>
    const podEmptyLabelB = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-16T14:44:26Z"),
        labels: {},
      },
    } as unknown as KubernetesServerResource<V1Pod>
    const uniq = deduplicatePodsByLabel([
      podA,
      podADupe,
      podUndefinedLabelA,
      podUndefinedLabelB,
      podEmptyLabelA,
      podEmptyLabelB,
    ])
    const expected = sortBy(
      [podA, podUndefinedLabelA, podUndefinedLabelB, podEmptyLabelA, podEmptyLabelB],
      (pod) => pod.metadata.creationTimestamp
    )
    expect(uniq).to.eql(expected)
  })
})

describe("millicpuToString", () => {
  it("should return a string suffixed with 'm'", () => {
    expect(millicpuToString(300)).to.equal("300m")
  })

  it("should return whole thousands as a single integer string", () => {
    expect(millicpuToString(3000)).to.equal("3")
  })

  it("should round off floating points", () => {
    expect(millicpuToString(100.5)).to.equal("100m")
  })
})

describe("kilobytesToString", () => {
  it("should return whole exabytes with an Ei suffix", () => {
    expect(kilobytesToString(2 * 1024 ** 5)).to.equal("2Ei")
  })

  it("should return whole petabytes with a Pi suffix", () => {
    expect(kilobytesToString(3 * 1024 ** 4)).to.equal("3Pi")
  })

  it("should return whole terabytes with a Ti suffix", () => {
    expect(kilobytesToString(1 * 1024 ** 3)).to.equal("1Ti")
  })

  it("should return whole gigabytes with a Gi suffix", () => {
    expect(kilobytesToString(7 * 1024 ** 2)).to.equal("7Gi")
  })

  it("should return whole megabytes with an Mi suffix", () => {
    expect(kilobytesToString(2 * 1024 ** 1)).to.equal("2Mi")
  })

  it("should otherwise return the kilobytes with a Ki suffix", () => {
    expect(kilobytesToString(1234)).to.equal("1234Ki")
  })

  it("should round off floating points", () => {
    expect(kilobytesToString(100.5)).to.equal("100Ki")
  })
})

describe("flattenResources", () => {
  it("should return resources that don't include resources of kind List as they were", () => {
    const resources = [
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "a",
        },
      },
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "b",
        },
      },
    ]
    expect(flattenResources(resources).map((r) => r.metadata.name)).to.eql(["a", "b"])
  })
  it("should flatten resourcess that contain resources of kind List", () => {
    const resources = [
      {
        apiVersion: "v1",
        items: [
          {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
              name: "a",
            },
          },
          {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
              name: "b",
            },
          },
        ],
        kind: "List",
        metadata: {
          name: "foo",
        },
      },
    ]
    expect(flattenResources(resources).map((r) => r.metadata.name)).to.eql(["a", "b"])
  })
  it("should flatten resources that contain List and non-List resources", () => {
    const resources = [
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "a",
        },
      },
      {
        apiVersion: "v1",
        items: [
          {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
              name: "b",
            },
          },
          {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
              name: "c",
            },
          },
        ],
        kind: "List",
        metadata: {
          name: "foo",
        },
      },
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "d",
        },
      },
    ]
    expect(flattenResources(resources).map((r) => r.metadata.name)).to.eql(["a", "b", "c", "d"])
  })
  it("should not flatten List resources that don't have apiVersion v1", () => {
    const resources = [
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "a",
        },
      },
      {
        apiVersion: "v2",
        items: [
          {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
              name: "b",
            },
          },
          {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
              name: "c",
            },
          },
        ],
        kind: "List",
        metadata: {
          name: "d",
        },
      },
      {
        apiVersion: "v2",
        kind: "ServiceAccount",
        metadata: {
          name: "e",
        },
      },
    ]
    expect(flattenResources(resources).map((r) => r.metadata.name)).to.eql(["a", "d", "e"])
  })
})

describe("getStaticLabelsFromPod", () => {
  it("should should only select labels without characters", () => {
    const pod = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        creationTimestamp: new Date("2019-11-12T14:44:26Z"),
        labels: {
          module: "a",
          service: "a",
          lean: "5",
          checksum: "a1b2c3d4",
        },
      },
      spec: {},
    } as unknown as KubernetesPod

    const labels = getStaticLabelsFromPod(pod)

    expect(labels).to.eql({
      module: "a",
      service: "a",
    })
  })
})

describe("getSelectorString", () => {
  it("should format a label map to comma separated key value string ", () => {
    const labels = {
      module: "a",
      service: "a",
    }
    const selectorString = getSelectorString(labels)

    expect(selectorString).to.eql("module=a,service=a")
  })
})

describe("makePodName", () => {
  it("should create a unique pod name with a hash suffix", () => {
    const name = makePodName("test", "some-module")
    expect(name.slice(0, -7)).to.equal("test-some-module")
  })

  it("should optionally include a secondary key", () => {
    const name = makePodName("test", "some-module", "unit")
    expect(name.slice(0, -7)).to.equal("test-some-module-unit")
  })

  it("should create different pod names at different times for the same inputs", async () => {
    const nameA = makePodName("test", "some-module", "unit")
    await sleep(100)
    const nameB = makePodName("test", "some-module", "unit")
    expect(nameA).to.not.equal(nameB)
  })

  it("should truncate the pod name if necessary", () => {
    const name = makePodName("test", "some-module-with-a-really-unnecessarily-long-name", "really-long-test-name-too")
    expect(name.length).to.equal(63)
    expect(name.slice(0, -7)).to.equal("test-some-module-with-a-really-unnecessarily-long-name-r")
  })
})

describe("matchSelector", () => {
  it("should return false if selector is empty", () => {
    const matched = matchSelector({}, { foo: "bar" })
    expect(matched).to.be.false
  })

  it("should return false if selector contains key missing from labels", () => {
    const matched = matchSelector({ foo: "bar" }, { nope: "nyet" })
    expect(matched).to.be.false
  })

  it("should return false if selector contains value mismatched with a label", () => {
    const matched = matchSelector({ foo: "bar" }, { foo: "nyet" })
    expect(matched).to.be.false
  })

  it("should return true if selector matches labels exactly", () => {
    const matched = matchSelector({ foo: "bar" }, { foo: "bar" })
    expect(matched).to.be.true
  })

  it("should return true if selector is a subset of labels", () => {
    const matched = matchSelector({ foo: "bar" }, { foo: "bar", something: "else" })
    expect(matched).to.be.true
  })
})

describe("isOctal", () => {
  describe("should recognize octal numbers", () => {
    it("in YAML <= 1.1", () => {
      expect(isOctal("0777")).to.true
    })

    it("in YAML >= 1.2", () => {
      expect(isOctal("0o777")).to.true
    })
  })

  it("should not recognize non-octal numeric strings", () => {
    expect(isOctal("777")).to.false
  })

  it("should not recognize hex numbers", () => {
    expect(isOctal("0xff")).to.false
  })

  it("should not non-numeric strings", () => {
    expect(isOctal("qweRTY")).to.false
  })
})
