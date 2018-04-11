import { ContainerModuleConfig, ContainerModuleHandler } from "../../../src/plugins/container"
import { dataDir, expectError, makeTestContext } from "../../helpers"
import { resolve } from "path"

describe("ContainerModuleHandler", () => {
  const projectRoot = resolve(dataDir, "test-project-container")
  const modulePath = resolve(dataDir, "test-project-container", "module-a")
  const handler = new ContainerModuleHandler()

  describe("parseModule", () => {
    it("should validate a container module", async () => {
      const ctx = await makeTestContext(projectRoot)

      const config: ContainerModuleConfig = {
        build: {
          command: "echo OK",
          dependencies: [],
        },
        name: "module-a",
        path: modulePath,
        allowPush: false,
        services: {
          "service-a": {
            command: ["echo"],
            dependencies: [],
            daemon: false,
            endpoints: [
              {
                paths: ["/"],
                port: "http",
              },
            ],
            healthCheck: {
              httpGet: {
                path: "/health",
                port: "http",
              },
            },
            ports: {
              http: {
                protocol: "TCP",
                containerPort: 8080,
              },
            },
            volumes: [],
          },
        },
        test: {
          unit: {
            command: ["echo", "OK"],
            dependencies: [],
            variables: {},
          },
        },
        type: "test",
        variables: {},
      }

      await handler.parseModule({ ctx, config })
    })

    it("should fail with invalid port in endpoint spec", async () => {
      const ctx = await makeTestContext(projectRoot)

      const config: ContainerModuleConfig = {
        build: {
          command: "echo OK",
          dependencies: [],
        },
        name: "module-a",
        path: modulePath,
        allowPush: false,
        services: {
          "service-a": {
            command: ["echo"],
            dependencies: [],
            daemon: false,
            endpoints: [
              {
                paths: ["/"],
                port: "bla",
              },
            ],
            ports: {},
            volumes: [],
          },
        },
        test: {
          unit: {
            command: ["echo", "OK"],
            dependencies: [],
            variables: {},
          },
        },
        type: "test",
        variables: {},
      }

      await expectError(() => handler.parseModule({ ctx, config }), "configuration")
    })

    it("should fail with invalid port in httpGet healthcheck spec", async () => {
      const ctx = await makeTestContext(projectRoot)

      const config: ContainerModuleConfig = {
        build: {
          command: "echo OK",
          dependencies: [],
        },
        name: "module-a",
        path: modulePath,
        allowPush: false,
        services: {
          "service-a": {
            command: ["echo"],
            dependencies: [],
            daemon: false,
            endpoints: [],
            healthCheck: {
              httpGet: {
                path: "/",
                port: "bla",
              },
            },
            ports: {},
            volumes: [],
          },
        },
        test: {
          unit: {
            command: ["echo", "OK"],
            dependencies: [],
            variables: {},
          },
        },
        type: "test",
        variables: {},
      }

      await expectError(() => handler.parseModule({ ctx, config }), "configuration")
    })

    it("should fail with invalid port in tcpPort healthcheck spec", async () => {
      const ctx = await makeTestContext(projectRoot)

      const config: ContainerModuleConfig = {
        build: {
          command: "echo OK",
          dependencies: [],
        },
        name: "module-a",
        path: modulePath,
        allowPush: false,
        services: {
          "service-a": {
            command: ["echo"],
            dependencies: [],
            daemon: false,
            endpoints: [],
            healthCheck: {
              tcpPort: "bla",
            },
            ports: {},
            volumes: [],
          },
        },
        test: {
          unit: {
            command: ["echo", "OK"],
            dependencies: [],
            variables: {},
          },
        },
        type: "test",
        variables: {},
      }

      await expectError(() => handler.parseModule({ ctx, config }), "configuration")
    })
  })
})
