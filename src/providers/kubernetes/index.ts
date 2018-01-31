import * as Docker from "dockerode"
import { exec } from "child-process-promise"
import { Memoize } from "typescript-memoize"
import * as K8s from "kubernetes-client"
import { DeploymentError } from "../../exceptions"
import { Plugin } from "../../types/plugin"
import { ContainerModule, ContainerService } from "../../moduleHandlers/container"
import { values, every } from "lodash"
import { Environment } from "../../types/common"
import { sleep } from "../../util"
import { Service, ServiceContext, ServiceStatus } from "../../types/service"
import { join } from "path"
import { createServices } from "./service"
import { createIngress } from "./ingress"
import { createDeployment } from "./deployment"
import { DEFAULT_CONTEXT, Kubectl, KUBECTL_DEFAULT_TIMEOUT } from "./client"

const GARDEN_SYSTEM_NAMESPACE = "garden-system"

const ingressControllerModulePath = join(__dirname, "k8s-ingress-controller")
const defaultBackendModulePath = join(__dirname, "k8s-default-backend")

export class KubernetesProvider extends Plugin<ContainerModule> {
  name = "kubernetes"
  supportedModuleTypes = ["container"]

  // TODO: validate provider config

  async getEnvironmentStatus(env: Environment) {
    try {
      // TODO: use API instead of kubectl (I just couldn't find which API call to make)
      await this.kubectl().call(["version"])
    } catch (err) {
      // TODO: catch error properly
      if (err.output) {
        throw new DeploymentError(err.output, { output: err.output })
      }
      throw err
    }

    const gardenEnv = this.getSystemEnv(env)

    const ingressControllerService = await this.getIngressControllerService()
    const defaultBackendService = await this.getDefaultBackendService()

    const ingressControllerStatus = await this.getServiceStatus(ingressControllerService, gardenEnv)
    const defaultBackendStatus = await this.getServiceStatus(defaultBackendService, gardenEnv)

    const statusDetail = {
      ingressControllerReady: ingressControllerStatus.state === "ready",
      defaultBackendReady: defaultBackendStatus.state === "ready",
      namespaceReady: false,
      systemNamespaceReady: false,
    }

    const namespacesStatus = await this.coreApi().namespaces().get()

    for (const n of namespacesStatus.items) {
      if (n.metadata.name === env.namespace && n.status.phase === "Active") {
        statusDetail.namespaceReady = true
      }

      if (n.metadata.name === GARDEN_SYSTEM_NAMESPACE && n.status.phase === "Active") {
        statusDetail.systemNamespaceReady = true
      }
    }

    let configured = every(values(statusDetail))

    return {
      configured,
      detail: statusDetail,
    }
  }

  async configureEnvironment(env: Environment) {
    const status = await this.getEnvironmentStatus(env)

    if (status.configured) {
      return
    }

    // TODO: start dashboard service

    if (!status.detail.systemNamespaceReady) {
      this.context.log.info("kubernetes", `Creating garden system namespace`)
      await this.coreApi().namespaces.post({
        body: {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: GARDEN_SYSTEM_NAMESPACE,
            annotations: {
              "garden.io/generated": "true",
            },
          },
        },
      })
    }

    if (!status.detail.namespaceReady) {
      this.context.log.info("kubernetes", `Creating namespace ${env.namespace}`)
      await this.coreApi().namespaces.post({
        body: {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: env.namespace,
            annotations: {
              "garden.io/generated": "true",
            },
          },
        },
      })
    }

    if (!status.detail.defaultBackendReady || !status.detail.ingressControllerReady) {
      this.context.log.info("kubernetes", `Configuring ingress controller`)
      const gardenEnv = this.getSystemEnv(env)
      await this.deployService(await this.getDefaultBackendService(), {}, gardenEnv)
      await this.deployService(await this.getIngressControllerService(), {}, gardenEnv)
    }
  }

  async getServiceStatus(service: ContainerService, env: Environment): Promise<ServiceStatus> {
    return await this.checkDeploymentStatus(service, env)
  }

  async deployService(service: ContainerService, serviceContext: ServiceContext, env: Environment) {
    const namespace = env.namespace
    const version = await service.module.getVersion()
    // TODO: allow this?
    const exposePorts = false

    const deployment = await createDeployment(service, exposePorts)
    await this.apply(version, deployment, { namespace })

    // TODO: automatically clean up Services and Ingresses if they should no longer exist

    const kubeservices = await createServices(service, exposePorts)

    for (let kubeservice of kubeservices) {
      await this.apply(version, kubeservice, { namespace })
    }

    const ingress = await createIngress(service)

    if (ingress !== null) {
      await this.apply(version, ingress, { namespace })
    }

    await this.waitForDeployment(service, env)

    return this.getServiceStatus(service, env)
  }

  async getServiceOutputs(service: Service<ContainerModule>) {
    return {
      host: service.name,
    }
  }

  async execInService(service: Service<ContainerModule>, command: string[], env: Environment) {
    const status = await this.getServiceStatus(service, env)

    // TODO: this check should probably live outside of the plugin
    if (!status.state || status.state !== "ready") {
      throw new DeploymentError(`Service ${service.name} is not running`, {
        name: service.name,
        state: status.state,
      })
    }

    // get a running pod
    let res = await this.coreApi(env.namespace).namespaces.pods.get({
      qs: {
        labelSelector: `service=${service.name}`,
      },
    })
    const pod = res.items[0]

    if (!pod) {
      // This should not happen because of the prior status check, but checking to be sure
      throw new DeploymentError(`Could not find running pod for ${service.name}`, {
        serviceName: service.name,
      })
    }

    // exec in the pod via kubectl
    res = await this.kubectl(env.namespace).tty(["exec", "-it", pod.metadata.name, "--", ...command])

    return { output: res.output }
  }

  private async getIngressControllerService() {
    const module = <ContainerModule>await this.context.resolveModule(ingressControllerModulePath)

    return new Service<ContainerModule>(module, "ingress-controller")
  }

  private async getDefaultBackendService() {
    const module = <ContainerModule>await this.context.resolveModule(defaultBackendModulePath)

    return new Service<ContainerModule>(module, "default-backend")
  }

  async checkDeploymentStatus(service: ContainerService, env: Environment, resourceVersion?: number) {
    const type = service.config.daemon ? "daemonsets" : "deployments"
    const namespace = env.namespace

    const out: ServiceStatus = {
      runningReplicas: 0,
      detail: { resourceVersion },
    }

    let statusRes
    let status

    try {
      statusRes = await this.extensionsApi(namespace).namespaces[type](service.name).get()
    } catch (err) {
      if (err.code === 404) {
        // service is not running
        return out
      } else {
        throw err
      }
    }

    status = statusRes.status

    if (!resourceVersion) {
      out.detail.resourceVersion = parseInt(statusRes.metadata.resourceVersion, 10)
    }

    out.version = statusRes.metadata.annotations["garden.io/version"]

    // TODO: try to come up with something more efficient. may need to wait for newer k8s version.
    // note: the resourceVersion parameter does not appear to work...
    const eventsRes = await this.coreApi(namespace).namespaces.events.get()

    // const eventsRes = await this.kubeApi(
    //   "GET",
    //   [
    //     "apis", apiSection, "v1beta1",
    //     "watch",
    //     "namespaces", namespace,
    //     type + "s", service.fullName,
    //   ],
    //   { resourceVersion, watch: "false" },
    // )

    // look for errors and warnings in the events for the service, abort if we find any
    const events = eventsRes.items

    for (let event of events) {
      const eventVersion = parseInt(event.metadata.resourceVersion, 10)

      if (
        eventVersion <= <number>resourceVersion ||
        (!event.metadata.name.startsWith(service.name + ".") && !event.metadata.name.startsWith(service.name + "-"))
      ) {
        continue
      }

      if (eventVersion > <number>resourceVersion) {
        out.detail.resourceVersion = eventVersion
      }

      if (event.type === "Warning" || event.type === "Error") {
        if (event.reason === "Unhealthy") {
          // still waiting on readiness probe
          continue
        }
        out.state = "unhealthy"
        out.lastError = `${event.reason} - ${event.message}`
        return out
      }

      let message = event.message

      if (event.reason === event.reason.toUpperCase()) {
        // some events like ingress events are formatted this way
        message = `${event.reason} ${message}`
      }

      if (message !== "") {
        this.context.log.verbose(service.name, message)
      }
    }

    // See `https://github.com/kubernetes/kubernetes/blob/master/pkg/kubectl/rollout_status.go` for a reference
    // for this logic.
    let available = 0
    out.state = "ready"
    let statusMsg = ""

    if (statusRes.metadata.generation > status.observedGeneration) {
      statusMsg = `Waiting for spec update to be observed...`
      out.state = "deploying"
    } else if (service.config.daemon) {
      const desired = status.desiredNumberScheduled || 0
      const updated = status.updatedNumberScheduled || 0
      available = status.numberAvailable || 0

      if (updated < desired) {
        statusMsg = `${updated} out of ${desired} new pods updated...`
        out.state = "deploying"
      } else if (available < desired) {
        statusMsg = `${available} out of ${desired} updated pods available...`
        out.state = "deploying"
      }
    } else {
      const desired = 1 // TODO: service.count[env.name] || 1
      const updated = status.updatedReplicas || 0
      const replicas = status.replicas || 0
      available = status.availableReplicas || 0

      if (updated < desired) {
        statusMsg = `Waiting for rollout: ${updated} out of ${desired} new replicas updated...`
        out.state = "deploying"
      } else if (replicas > updated) {
        statusMsg = `Waiting for rollout: ${replicas - updated} old replicas pending termination...`
        out.state = "deploying"
      } else if (available < updated) {
        statusMsg = `Waiting for rollout: ${available} out of ${updated} updated replicas available...`
        out.state = "deploying"
      }
    }

    out.runningReplicas = available

    if (statusMsg !== "") {
      this.context.log.verbose(service.name, statusMsg)
    }

    return out
  }

  async waitForDeployment(service: ContainerService, env: Environment) {
    // NOTE: using `kubectl rollout status` here didn't pan out, since it just times out when errors occur.
    let loops = 0
    let resourceVersion
    const startTime = new Date().getTime()

    this.context.log.verbose(service.name, `Waiting for service to be ready...`)

    while (true) {
      await sleep(2000 + 1000 * loops)

      const status = await this.checkDeploymentStatus(service, env, resourceVersion)

      if (status.state === "ready") {
        break
      }

      resourceVersion = status.detail.resourceVersion

      const now = new Date().getTime()

      if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
        throw new Error(`Timed out waiting for ${service.name} to deploy`)
      }
    }
  }

  // sadly the TS definitions are no good for this one
  @Memoize()
  protected coreApi(namespace?: string): any {
    const config = K8s.config.loadKubeconfig()
    const params: any = K8s.config.fromKubeconfig(config, DEFAULT_CONTEXT)

    params.promises = true
    params.namespace = namespace

    return new K8s.Core(params)
  }

  @Memoize()
  protected extensionsApi(namespace?: string): any {
    const config = K8s.config.loadKubeconfig()
    const params: any = K8s.config.fromKubeconfig(config, DEFAULT_CONTEXT)

    params.promises = true
    params.namespace = namespace

    return new K8s.Extensions(params)
  }

  @Memoize()
  public kubectl(namespace?: string) {
    return new Kubectl({ context: DEFAULT_CONTEXT, namespace })
  }

  @Memoize()
  protected getDocker() {
    return new Docker()
  }

  protected async apply(version: string, obj: any,
                        { force = false, namespace }: { force?: boolean, namespace?: string } = {}) {
    const kind = obj.kind
    const name = obj.metadata.name

    this.context.log.debug(name, `Applying ${kind}...`)

    const data = Buffer.from(JSON.stringify(obj))

    let args = ["apply"]
    force && args.push("--force")
    args.push("-f")
    args.push("-")

    await this.kubectl(namespace).call(args, { data })
  }

  private getSystemEnv(env: Environment): Environment {
    return { name: env.name, namespace: GARDEN_SYSTEM_NAMESPACE, config: { providers: {} } }
  }
}
