/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { platform } from "os"
import { expect } from "chai"
import td from "testdouble"
import { HotReloadableResource } from "../../../../../src/plugins/kubernetes/hot-reload/hot-reload"

import { setPlatform, makeTestGarden, TestGarden, getDataDir } from "../../../../helpers"
import { ConfigGraph } from "../../../../../src/config-graph"
import { cloneDeep } from "lodash"
import {
  configureHotReload,
  removeTrailingSlashes,
  rsyncSourcePath,
  makeCopyCommand,
  filesForSync,
} from "../../../../../src/plugins/kubernetes/hot-reload/helpers"
import { rsyncPortName } from "../../../../../src/plugins/kubernetes/constants"

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
                    subPath: "root/app/",
                  },
                ],
                ports: [],
                args: ["some", "args"],
              },
              {
                name: "garden-rsync",
                image: "gardendev/rsync:0.2.0",
                imagePullPolicy: "IfNotPresent",
                env: [
                  {
                    name: "ALLOW",
                    value: "0.0.0.0/0",
                  },
                ],
                readinessProbe: {
                  initialDelaySeconds: 2,
                  periodSeconds: 1,
                  timeoutSeconds: 3,
                  successThreshold: 1,
                  failureThreshold: 5,
                  tcpSocket: { port: <object>(<unknown>rsyncPortName) },
                },
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
                command: [
                  "/bin/sh",
                  "-c",
                  "mkdir -p /.garden/hot_reload/root && mkdir -p /.garden/hot_reload/tmp/app/ && " +
                    "cp -r /app/ /.garden/hot_reload/root/app/",
                ],
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

  it("should correctly augment a Pod resource", async () => {
    const target = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "foo",
      },
      spec: {
        containers: [
          {
            image: "garden-io/foo",
          },
        ],
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
      kind: "Pod",
      metadata: {
        name: "foo",
        annotations: {
          "garden.io/hot-reload": "true",
        },
      },
      spec: {
        containers: [
          {
            image: "garden-io/foo",
            volumeMounts: [
              {
                name: "garden-sync",
                mountPath: "/app",
                subPath: "root/app/",
              },
            ],
            ports: [],
            args: ["some", "args"],
          },
          {
            name: "garden-rsync",
            image: "gardendev/rsync:0.2.0",
            imagePullPolicy: "IfNotPresent",
            env: [
              {
                name: "ALLOW",
                value: "0.0.0.0/0",
              },
            ],
            readinessProbe: {
              initialDelaySeconds: 2,
              periodSeconds: 1,
              timeoutSeconds: 3,
              successThreshold: 1,
              failureThreshold: 5,
              tcpSocket: { port: <object>(<unknown>rsyncPortName) },
            },
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
            command: [
              "/bin/sh",
              "-c",
              "mkdir -p /.garden/hot_reload/root && mkdir -p /.garden/hot_reload/tmp/app/ && " +
                "cp -r /app/ /.garden/hot_reload/root/app/",
            ],
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
  const resA = [
    "mkdir -p /.garden/hot_reload/root",
    "mkdir -p /.garden/hot_reload/tmp/app/",
    "cp -r /app/ /.garden/hot_reload/root/app/",
  ].join(" && ")

  const resB = [
    "mkdir -p /.garden/hot_reload/root/app/src",
    "mkdir -p /.garden/hot_reload/tmp/app/src/foo/",
    "cp -r /app/src/foo/ /.garden/hot_reload/root/app/src/foo/",
  ].join(" && ")

  const resC = [
    "mkdir -p /.garden/hot_reload/root/app",
    "mkdir -p /.garden/hot_reload/tmp/app/src1/",
    "cp -r /app/src1/ /.garden/hot_reload/root/app/src1/",
    "mkdir -p /.garden/hot_reload/root/app",
    "mkdir -p /.garden/hot_reload/tmp/app/src2/",
    "cp -r /app/src2/ /.garden/hot_reload/root/app/src2/",
  ].join(" && ")

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

describe("filesForSync", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  const projectRoot = getDataDir("test-projects", "include-exclude")

  before(async () => {
    garden = await makeTestGarden(projectRoot)
    graph = await garden.getConfigGraph(garden.log)
  })

  it("should respect module include and exclude", async () => {
    const moduleA = graph.getModule("module-a")
    const files = filesForSync(moduleA, "*")
    expect(files).to.eql(["somedir/yes.txt", "yes.txt"])
  })

  it("should treat '.' sources the same as '*'", async () => {
    const moduleA = graph.getModule("module-a")
    const files = filesForSync(moduleA, ".")
    expect(files).to.eql(["somedir/yes.txt", "yes.txt"])
  })

  it("should filter files on source prefix, and return the relative path from the source path", async () => {
    const moduleA = graph.getModule("module-a")
    const files = filesForSync(moduleA, "somedir")
    expect(files).to.eql(["yes.txt"])
  })

  it("should correctly handle Windows paths", async () => {
    const moduleA = cloneDeep(graph.getModule("module-a"))

    moduleA.path = "C:\\Some Directory\\code\\module-a"
    moduleA.version.files = [
      "C:\\Some Directory\\code\\module-a\\somedir\\yes.txt",
      "C:\\Some Directory\\code\\module-a\\yes.txt",
    ]

    expect(filesForSync(moduleA, "somedir")).to.eql(["yes.txt"])
    expect(filesForSync(moduleA, "*")).to.eql(["somedir/yes.txt", "yes.txt"])
    expect(filesForSync(moduleA, ".")).to.eql(["somedir/yes.txt", "yes.txt"])
  })
})
