import { platform } from "os"
import { expect } from "chai"
import td from "testdouble"
import { HotReloadableResource, rsyncSourcePath } from "../../../../../src/plugins/kubernetes/hot-reload"

import {
  removeTrailingSlashes,
  makeCopyCommand,
  configureHotReload,
} from "../../../../../src/plugins/kubernetes/hot-reload"
import { setPlatform } from "../../../../helpers"

describe("configureHotReload", () => {
  it("should correctly augment a resource manifest with containers and volume for hot reloading", async () => {
    const target = {
      apiVersion: "v1",
      kind: "Deployment",
      metadata: {
        name: "foo",
      },
      spec: {
        template: {
          metadata: {},
          spec: {
            containers: [
              {
                image: "garden-io/foo",
              },
            ],
          },
        },
      },
    }

    configureHotReload({
      target: <HotReloadableResource>target,
      hotReloadSpec: {
        sync: [
          {
            source: "*",
            target: "/app",
          },
        ],
      },
      hotReloadArgs: ["some", "args"],
    })

    expect(target).to.eql({
      apiVersion: "v1",
      kind: "Deployment",
      metadata: {
        name: "foo",
        annotations: {
          "garden.io/hot-reload": "true",
        },
      },
      spec: {
        template: {
          metadata: {},
          spec: {
            containers: [
              {
                image: "garden-io/foo",
                volumeMounts: [
                  {
                    name: "garden-sync",
                    mountPath: "/app",
                    subPath: "app/",
                  },
                ],
                ports: [],
                args: ["some", "args"],
              },
              {
                name: "garden-rsync",
                image: "gardendev/rsync:0.1",
                imagePullPolicy: "IfNotPresent",
                env: [
                  {
                    name: "ALLOW",
                    value: "0.0.0.0/0",
                  },
                ],
                volumeMounts: [
                  {
                    name: "garden-sync",
                    mountPath: "/data",
                  },
                ],
                ports: [
                  {
                    name: "garden-rsync",
                    protocol: "TCP",
                    containerPort: 873,
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "garden-sync",
                emptyDir: {},
              },
            ],
            initContainers: [
              {
                name: "garden-sync-init",
                image: "garden-io/foo",
                command: ["/bin/sh", "-c", "mkdir -p /.garden/hot_reload && cp -r /app/ /.garden/hot_reload/app/"],
                env: [],
                imagePullPolicy: "IfNotPresent",
                volumeMounts: [
                  {
                    name: "garden-sync",
                    mountPath: "/.garden/hot_reload",
                  },
                ],
              },
            ],
          },
        },
      },
    })
  })
})

describe("removeTrailingSlashes", () => {
  const paths = [
    ["/foo/bar", "/foo/bar"],
    ["/foo/bar/", "/foo/bar"],
    ["/foo", "/foo"],
    ["/foo/", "/foo"],
    ["/foo/bar//", "/foo/bar"],
  ]

  for (const path of paths) {
    it(`handles paths correctly for ${path[0]}`, () => {
      expect(removeTrailingSlashes(path[0])).to.eql(path[1])
    })
  }
})

describe("rsyncSourcePath", () => {
  const currentPlatform = platform()

  context("platform uses POSIX style paths", () => {
    const modulePath = "/module/path"

    before(() => {
      setPlatform("darwin")
    })

    beforeEach(() => {
      if (currentPlatform === "win32") {
        // Mock the path.resolve function if testing for POSIX style platforms on a Windows platform.
        const path = require("path")
        const resolve = td.replace(path, "resolve")
        td.when(resolve(modulePath, "foo")).thenReturn(`${modulePath}/foo`)
        td.when(resolve(modulePath, "foo/")).thenReturn(`${modulePath}/foo`)
        td.when(resolve(modulePath, "foo/bar")).thenReturn(`${modulePath}/foo/bar`)
        td.when(resolve(modulePath, "foo/bar/")).thenReturn(`${modulePath}/foo/bar`)
        td.when(resolve(modulePath, "foo/bar//")).thenReturn(`${modulePath}/foo/bar`)
      }
    })

    after(() => {
      setPlatform(currentPlatform)
    })

    const paths = [
      ["foo", "/module/path/foo/"],
      ["foo/", "/module/path/foo/"],
      ["foo/bar", "/module/path/foo/bar/"],
      ["foo/bar/", "/module/path/foo/bar/"],
      ["foo/bar//", "/module/path/foo/bar/"],
    ]
    for (const path of paths) {
      it(`returns the full path with a trailing slash for ${path[0]}`, () => {
        expect(rsyncSourcePath(modulePath, path[0])).to.eql(path[1])
      })
    }
  })

  context("platform uses Win32 style paths", () => {
    const modulePath = "C:\\module\\path"

    before(() => {
      setPlatform("win32")
    })

    beforeEach(() => {
      if (currentPlatform !== "win32") {
        // Mock the path.resolve function when testing for Windows on a non-windows platform.
        const path = require("path")
        const resolve = td.replace(path, "resolve")
        td.when(resolve(modulePath, "foo")).thenReturn(`${modulePath}\\foo`)
        td.when(resolve(modulePath, "foo/")).thenReturn(`${modulePath}\\foo`)
        td.when(resolve(modulePath, "foo/bar")).thenReturn(`${modulePath}\\foo\\bar`)
        td.when(resolve(modulePath, "foo/bar/")).thenReturn(`${modulePath}\\foo\\bar`)
        td.when(resolve(modulePath, "foo/bar//")).thenReturn(`${modulePath}\\foo\\bar`)
      }
    })

    after(() => {
      setPlatform(currentPlatform)
    })

    const paths = [
      ["foo", "/cygdrive/c/module/path/foo/"],
      ["foo/", "/cygdrive/c/module/path/foo/"],
      ["foo/bar", "/cygdrive/c/module/path/foo/bar/"],
      ["foo/bar/", "/cygdrive/c/module/path/foo/bar/"],
      ["foo/bar//", "/cygdrive/c/module/path/foo/bar/"],
    ]

    for (const p of paths) {
      it(`returns the full path with a trailing slash for ${p[0]}`, () => {
        expect(rsyncSourcePath(modulePath, p[0])).to.eql(p[1])
      })
    }
  })
})

describe("makeCopyCommand", () => {
  const resA = "mkdir -p /.garden/hot_reload && cp -r /app/ /.garden/hot_reload/app/"
  const resB = "mkdir -p /.garden/hot_reload/app/src && cp -r /app/src/foo/ /.garden/hot_reload/app/src/foo/"
  const resC =
    "mkdir -p /.garden/hot_reload/app && cp -r /app/src1/ /.garden/hot_reload/app/src1/ && " +
    "mkdir -p /.garden/hot_reload/app && cp -r /app/src2/ /.garden/hot_reload/app/src2/"

  it("ensures a trailing slash in the copy source and target", () => {
    expect(makeCopyCommand(["/app/"])).to.eql(resA)
    expect(makeCopyCommand(["/app"])).to.eql(resA)
  })

  it("correctly handles target paths with more than one path component", () => {
    expect(makeCopyCommand(["/app/src/foo"])).to.eql(resB)
  })

  it("correctly handles multiple target paths", () => {
    expect(makeCopyCommand(["/app/src1", "/app/src2/"])).to.eql(resC)
  })

  context("platform is Windows", () => {
    const currentPlatform = platform()

    before(() => {
      setPlatform("win32")
    })

    after(() => {
      setPlatform(currentPlatform)
    })

    it("should return the same value as on platforms that use POSIX style paths", () => {
      expect(makeCopyCommand(["/app/"])).to.eql(resA)
      expect(makeCopyCommand(["/app"])).to.eql(resA)
      expect(makeCopyCommand(["/app/src/foo"])).to.eql(resB)
      expect(makeCopyCommand(["/app/src1", "/app/src2/"])).to.eql(resC)
    })
  })
})
