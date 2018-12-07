import { expect } from "chai"
import { HotReloadableResource } from "../../../../src/plugins/kubernetes/hot-reload"

import {
  removeTrailingSlashes,
  makeCopyCommands,
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
                  "mkdir -p /.garden/hot_reload/app/ && cp -r */. /.garden/hot_reload/app/",
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

describe("makeCopyCommands", () => {
  // Test cases for each type
  const configs: any[] = [
    // Source is missing slash
    [
      [{ source: "src", target: "/app/src" }],
      "mkdir -p /.garden/hot_reload/app/src/ && cp -r src/. /.garden/hot_reload/app/src/",
    ],
    // Source ends on slash
    [
      [{ source: "src/", target: "/app/src" }],
      "mkdir -p /.garden/hot_reload/app/src/ && cp -r src/. /.garden/hot_reload/app/src/",
    ],
    // Base root of the module
    [
      [{ source: ".", target: "/app" }],
      "mkdir -p /.garden/hot_reload/app/ && cp -r ./. /.garden/hot_reload/app/",
    ],
    // Subdirectory not ending on a slash
    [
      [{ source: "src/foo", target: "/app/foo" }],
      "mkdir -p /.garden/hot_reload/app/foo/ && cp -r src/foo/. /.garden/hot_reload/app/foo/",
    ],
    // Multiple pairs
    [
      [
        { source: "src1", target: "/app/src1" },
        { source: "src2", target: "/app/src2" },
      ],
      "mkdir -p /.garden/hot_reload/app/src1/ && cp -r src1/. /.garden/hot_reload/app/src1/ && " +
      "mkdir -p /.garden/hot_reload/app/src2/ && cp -r src2/. /.garden/hot_reload/app/src2/",
    ],
  ]
  for (const config of configs) {
    it("correctly generates copy commands for the hot reload init container", () => {
      expect(makeCopyCommands(config[0])).to.eql(config[1])
    })
  }
})
