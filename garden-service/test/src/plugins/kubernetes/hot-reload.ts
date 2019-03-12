import { expect } from "chai"
import { HotReloadableResource } from "../../../../src/plugins/kubernetes/hot-reload"

import {
  removeTrailingSlashes,
  makeCopyCommand,
  configureHotReload,
} from "../../../../src/plugins/kubernetes/hot-reload"

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
            containers: [{
              image: "garden-io/foo",
            }],
          },
        },
      },
    }

    configureHotReload({
      target: <HotReloadableResource>target,
      hotReloadSpec: {
        sync: [{
          source: "*",
          target: "/app",
        }],
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
                args: [
                  "some",
                  "args",
                ],
              },
              {
                name: "garden-rsync",
                image: "eugenmayer/rsync",
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
                command: [
                  "/bin/sh",
                  "-c",
                  "mkdir -p /.garden/hot_reload && cp -r /app/ /.garden/hot_reload/app/",
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

describe("makeCopyCommand", () => {

  it("ensures a trailing slash in the copy source and target", () => {
    const cmd = "mkdir -p /.garden/hot_reload && cp -r /app/ /.garden/hot_reload/app/"
    expect(makeCopyCommand(["/app/"])).to.eql(cmd)
    expect(makeCopyCommand(["/app"])).to.eql(cmd)
  })

  it("correctly handles target paths with more than one path component", () => {
    const cmd = "mkdir -p /.garden/hot_reload/app/src && cp -r /app/src/foo/ /.garden/hot_reload/app/src/foo/"
    expect(makeCopyCommand(["/app/src/foo"])).to.eql(cmd)
  })

  it("correctly handles multiple target paths", () => {
    const cmd = "mkdir -p /.garden/hot_reload/app && cp -r /app/src1/ /.garden/hot_reload/app/src1/ && " +
      "mkdir -p /.garden/hot_reload/app && cp -r /app/src2/ /.garden/hot_reload/app/src2/"
    expect(makeCopyCommand(["/app/src1", "/app/src2/"])).to.eql(cmd)
  })

})
