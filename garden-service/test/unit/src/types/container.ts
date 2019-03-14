import { expect } from "chai"
import { validate } from "../../../../src/config/common"
import { portSchema } from "../../../../src/plugins/container/config"

describe("portSchema", () => {
  it("should default servicePort to containerPorts value", async () => {
    const containerPort = 8080
    const obj = { name: "a", containerPort }

    const value = validate(obj, portSchema)
    expect(value["servicePort"]).to.equal(containerPort)
  })

  it("should not default servicePort to containerPorts when configured", async () => {
    const containerPort = 8080
    const servicePort = 9090
    const obj = { name: "a", containerPort, servicePort }

    const value = validate(obj, portSchema)
    expect(value["servicePort"]).to.equal(servicePort)
  })
})
