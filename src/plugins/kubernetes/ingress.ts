import { ContainerService } from "../container"

export async function createIngress(service: ContainerService, externalHostname: string) {
  if (service.config.endpoints.length === 0) {
    return null
  }

  const rules = service.config.endpoints.map(e => {
    const rule: any = {}

    // TODO: support separate hostnames per endpoint
    rule.host = externalHostname

    const backend = {
      serviceName: service.name,
      servicePort: e.containerPort,
    }

    rule.http = {
      paths: (e.paths || ["/"]).map(p => ({
        path: p,
        backend,
      })),
    }

    return rule
  })

  return {
    apiVersion: "extensions/v1beta1",
    kind: "Ingress",
    metadata: {
      name: service.name,
      annotations: {
        "garden.io/generated": "true",
        "garden.io/version": await service.module.getVersion(),
        "kubernetes.io/ingress.class": "nginx",
        // TODO: allow overriding this (should only be applied to localhost deployments)
        "ingress.kubernetes.io/force-ssl-redirect": "false",
      },
    },
    spec: {
      rules,
    },
  }
}
