import { ContainerService } from "../container"
import { DEFAULT_PORT_PROTOCOL } from "../../constants"

export async function createServices(service: ContainerService, exposePorts: boolean) {
  const services: any = []
  const version = await service.module.getVersion()

  const addService = (name: string, type: string, ports: any[]) => {
    services.push({
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name,
        annotations: {
          "garden.io/generated": "true",
          "garden.io/version": version,
        },
      },
      spec: {
        ports,
        selector: {
          service: service.name,
        },
        type,
      },
    })
  }

  // first add internally exposed (ClusterIP) service
  const internalPorts: any = []

  for (let port of service.config.ports) {
    internalPorts.push({
      name: port.name || "default",
      protocol: port.protocol || DEFAULT_PORT_PROTOCOL,
      targetPort: port.containerPort,
      port: port.containerPort,
    })
  }

  if (internalPorts.length) {
    addService(service.name, "ClusterIP", internalPorts)
  }

  // optionally add a NodePort service for externally open ports, if applicable
  // TODO: explore nicer ways to do this
  if (exposePorts) {
    const exposedPorts = service.config.ports.filter(p => p.nodePort)

    if (exposedPorts.length > 0) {
      addService(service.name + "-nodeport", "NodePort", exposedPorts.map(port => ({
        // TODO: do the parsing and defaults when loading the yaml
        name: port.name || "default",
        protocol: port.protocol || DEFAULT_PORT_PROTOCOL,
        port: port.containerPort,
        nodePort: port.nodePort,
      })))
    }
  }

  return services
}
