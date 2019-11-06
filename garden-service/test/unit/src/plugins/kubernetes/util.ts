import { expect } from "chai"
import { millicpuToString, kilobytesToString, flattenResources } from "../../../../../src/plugins/kubernetes/util"

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
