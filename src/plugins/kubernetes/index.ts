/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Docker from "dockerode"
import { Memoize } from "typescript-memoize"
import * as K8s from "kubernetes-client"
import { DeploymentError } from "../../exceptions"
import {
  ConfigureEnvironmentParams, DeleteConfigParams, DeployServiceParams, ExecInServiceParams, GetConfigParams,
  GetEnvironmentStatusParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetServiceStatusParams, GetTestResultParams, Plugin, SetConfigParams,
  TestModuleParams, TestResult,
} from "../../types/plugin"
import {
  ContainerModule, ContainerService, ServiceEndpointSpec,
} from "../container"
import { values, every, map, extend } from "lodash"
import { Environment } from "../../types/common"
import { deserializeKeys, serializeKeys, sleep, splitFirst } from "../../util"
import { Service, ServiceProtocol, ServiceStatus } from "../../types/service"
import { join } from "path"
import { createServices } from "./service"
import { createIngress } from "./ingress"
import { createDeployment } from "./deployment"
import { DEFAULT_CONTEXT, Kubectl, KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { DEFAULT_TEST_TIMEOUT, STATIC_DIR } from "../../constants"
import { LogEntry } from "../../logger"
import { GardenContext } from "../../context"
import * as split from "split"
import moment = require("moment")
import { LogSymbolType } from "../../logger/types"

const GARDEN_SYSTEM_NAMESPACE = "garden-system"

const ingressControllerModulePath = join(STATIC_DIR, "garden-ingress-controller")
const defaultBackendModulePath = join(STATIC_DIR, "garden-default-backend")
const dashboardModulePath = join(STATIC_DIR, "garden-dashboard")
const dashboardSpecPath = join(dashboardModulePath, "dashboard.yml")
const localIngressPort = 32000

export class KubernetesProvider implements Plugin<ContainerModule> {
  name = "kubernetes"
  supportedModuleTypes = ["container"]

  // TODO: validate provider config

  //===========================================================================
  //region Plugin actions
  //===========================================================================

  async getEnvironmentStatus({ ctx, env }: GetEnvironmentStatusParams) {
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

    const ingressControllerService = await this.getIngressControllerService(ctx)
    const defaultBackendService = await this.getDefaultBackendService(ctx)
    const dashboardService = await this.getDashboardService(ctx)

    const ingressControllerStatus = await this.checkDeploymentStatus({
      ctx,
      service: ingressControllerService,
      env: gardenEnv,
    })
    const defaultBackendStatus = await this.checkDeploymentStatus({
      ctx,
      service: defaultBackendService,
      env: gardenEnv,
    })
    const dashboardStatus = await this.checkDeploymentStatus({
      ctx,
      service: dashboardService,
      env: gardenEnv,
    })

    const statusDetail = {
      systemNamespaceReady: false,
      namespaceReady: false,
      metadataNamespaceReady: false,
      dashboardReady: dashboardStatus.state === "ready",
      ingressControllerReady: ingressControllerStatus.state === "ready",
      defaultBackendReady: defaultBackendStatus.state === "ready",
    }

    const metadataNamespace = this.getMetadataNamespaceName(ctx)
    const namespacesStatus = await this.coreApi().namespaces().get()

    for (const n of namespacesStatus.items) {
      if (n.metadata.name === this.getNamespaceName(ctx, env) && n.status.phase === "Active") {
        statusDetail.namespaceReady = true
      }

      if (n.metadata.name === metadataNamespace && n.status.phase === "Active") {
        statusDetail.metadataNamespaceReady = true
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

  async configureEnvironment({ ctx, env, logEntry }: ConfigureEnvironmentParams) {
    // TODO: use Helm 3 when it's released instead of this custom/manual stuff
    const status = await this.getEnvironmentStatus({ ctx, env })

    if (status.configured) {
      return
    }

    if (!status.detail.systemNamespaceReady) {
      logEntry && logEntry.setState({ section: "kubernetes", msg: `Creating garden system namespace` })
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
      const ns = this.getNamespaceName(ctx, env)
      logEntry && logEntry.setState({ section: "kubernetes", msg: `Creating namespace ${ns}` })
      await this.coreApi().namespaces.post({
        body: {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: ns,
            annotations: {
              "garden.io/generated": "true",
            },
          },
        },
      })
    }

    if (!status.detail.metadataNamespaceReady) {
      const ns = this.getMetadataNamespaceName(ctx)
      logEntry && logEntry.setState({ section: "kubernetes", msg: `Creating namespace ${ns}` })
      await this.coreApi().namespaces.post({
        body: {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: ns,
            annotations: {
              "garden.io/generated": "true",
            },
          },
        },
      })
    }

    if (!status.detail.dashboardReady) {
      logEntry && logEntry.setState({ section: "kubernetes", msg: `Configuring dashboard` })
      // TODO: deploy this as a service
      await this.kubectl(GARDEN_SYSTEM_NAMESPACE).call(["apply", "-f", dashboardSpecPath])
    }

    if (!status.detail.ingressControllerReady) {
      logEntry && logEntry.setState({ section: "kubernetes", msg: `Configuring ingress controller` })
      const gardenEnv = this.getSystemEnv(env)
      await this.deployService({
        ctx,
        service: await this.getDefaultBackendService(ctx),
        serviceContext: { envVars: {}, dependencies: {} },
        env: gardenEnv,
        logEntry,
      })
      await this.deployService({
        ctx,
        service: await this.getIngressControllerService(ctx),
        serviceContext: { envVars: {}, dependencies: {} },
        env: gardenEnv,
        exposePorts: true,
        logEntry,
      })
    }
  }

  async getServiceStatus({ ctx, service }: GetServiceStatusParams<ContainerModule>): Promise<ServiceStatus> {
    // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
    return await this.checkDeploymentStatus({ ctx, service })
  }

  async deployService(
    { ctx, service, env, serviceContext, exposePorts = false, logEntry }: DeployServiceParams<ContainerModule>,
  ) {
    const namespace = this.getNamespaceName(ctx, env)

    const deployment = await createDeployment(service, serviceContext, exposePorts)
    await this.apply(deployment, { namespace })

    // TODO: automatically clean up Services and Ingresses if they should no longer exist

    const kubeservices = await createServices(service, exposePorts)

    for (let kubeservice of kubeservices) {
      await this.apply(kubeservice, { namespace })
    }

    const ingress = await createIngress(service, this.getServiceHostname(ctx, service))

    if (ingress !== null) {
      await this.apply(ingress, { namespace })
    }

    await this.waitForDeployment({ ctx, service, logEntry, env })

    return this.getServiceStatus({ ctx, service, env })
  }

  async getServiceOutputs({ service }: GetServiceOutputsParams<ContainerModule>) {
    return {
      host: service.name,
    }
  }

  async execInService({ ctx, service, env, command }: ExecInServiceParams<ContainerModule>) {
    const status = await this.getServiceStatus({ ctx, service, env })
    const namespace = this.getNamespaceName(ctx, env)

    // TODO: this check should probably live outside of the plugin
    if (!status.state || status.state !== "ready") {
      throw new DeploymentError(`Service ${service.name} is not running`, {
        name: service.name,
        state: status.state,
      })
    }

    // get a running pod
    let res = await this.coreApi(namespace).namespaces.pods.get({
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
    res = await this.kubectl(namespace).tty(["exec", "-it", pod.metadata.name, "--", ...command])

    return { code: res.code, output: res.output }
  }

  async testModule({ ctx, module, testSpec }: TestModuleParams<ContainerModule>): Promise<TestResult> {
    // TODO: include a service context here
    const baseEnv = {}
    const envVars: {} = extend({}, baseEnv, testSpec.variables)
    const envArgs = map(envVars, (v: string, k: string) => `--env=${k}=${v}`)

    // TODO: use the runModule() method
    const testCommandStr = testSpec.command.join(" ")
    const image = await module.getImageId()
    const version = await module.getVersion()

    const kubecmd = [
      "run", `run-${module.name}-${Math.round(new Date().getTime())}`,
      `--image=${image}`,
      "--restart=Never",
      "--command",
      "-i",
      "--tty",
      "--rm",
      ...envArgs,
      "--",
      "/bin/sh",
      "-c",
      testCommandStr,
    ]

    const startedAt = new Date()

    const timeout = testSpec.timeout || DEFAULT_TEST_TIMEOUT
    const res = await this.kubectl(this.getNamespaceName(ctx)).tty(kubecmd, { ignoreError: true, timeout })

    const testResult: TestResult = {
      version,
      success: res.code === 0,
      startedAt,
      completedAt: new Date(),
      output: res.output,
    }

    const ns = this.getMetadataNamespaceName(ctx)
    const resultKey = `test-result--${module.name}--${version}`
    const body = {
      body: {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name: resultKey,
          annotations: {
            "garden.io/generated": "true",
          },
        },
        type: "generic",
        data: serializeKeys(testResult),
      },
    }

    await apiPostOrPut(this.coreApi(ns).namespaces.configmaps, resultKey, body)

    return testResult
  }

  async getTestResult({ ctx, module, version }: GetTestResultParams<ContainerModule>) {
    const ns = this.getMetadataNamespaceName(ctx)
    const resultKey = getTestResultKey(module, version)
    const res = await apiGetOrNull(this.coreApi(ns).namespaces.configmaps, resultKey)
    return res && <TestResult>deserializeKeys(res.data)
  }

  async getServiceLogs({ ctx, service, stream, tail }: GetServiceLogsParams<ContainerModule>) {
    const resourceType = service.config.daemon ? "daemonset" : "deployment"

    const kubectlArgs = ["logs", `${resourceType}/${service.name}`, "--timestamps=true"]

    if (tail) {
      kubectlArgs.push("--follow")
    }

    const proc = this.kubectl(this.getNamespaceName(ctx)).spawn(kubectlArgs)

    proc.stdout
      .pipe(split())
      .on("data", (s) => {
        if (!s) {
          return
        }
        const [timestampStr, msg] = splitFirst(s, " ")
        const timestamp = moment(timestampStr)
        stream.write({ serviceName: service.name, timestamp, msg })
      })

    proc.stderr.pipe(process.stderr)

    return new Promise<void>((resolve, reject) => {
      proc.on("error", reject)

      proc.on("exit", () => {
        resolve()
      })
    })
  }

  async getConfig({ ctx, key }: GetConfigParams) {
    const ns = this.getMetadataNamespaceName(ctx)
    const res = await apiGetOrNull(this.coreApi(ns).namespaces.secrets, key.join("."))
    return res && Buffer.from(res.data.value, "base64").toString()
  }

  async setConfig({ ctx, key, value }: SetConfigParams) {
    // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
    const ns = this.getMetadataNamespaceName(ctx)
    const body = {
      body: {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: key,
          annotations: {
            "garden.io/generated": "true",
          },
        },
        type: "generic",
        stringData: { value },
      },
    }

    await apiPostOrPut(this.coreApi(ns).namespaces.secrets, key.join("."), body)
  }

  async deleteConfig({ ctx, key }: DeleteConfigParams) {
    const ns = this.getMetadataNamespaceName(ctx)
    try {
      await this.coreApi(ns).namespaces.secrets(key.join(".")).delete()
    } catch (err) {
      if (err.code === 404) {
        return { found: false }
      } else {
        throw err
      }
    }
    return { found: true }
  }

  //endregion

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  private getNamespaceName(ctx: GardenContext, env?: Environment) {
    const currentEnv = env || ctx.getEnvironment()
    if (currentEnv.namespace === GARDEN_SYSTEM_NAMESPACE) {
      return currentEnv.namespace
    }
    return `garden--${ctx.projectName}--${currentEnv.namespace}`
  }

  private getMetadataNamespaceName(ctx: GardenContext) {
    const env = ctx.getEnvironment()
    return `garden-metadata--${ctx.projectName}--${env.namespace}`
  }

  private async getIngressControllerService(ctx: GardenContext) {
    const module = <ContainerModule>await ctx.resolveModule(ingressControllerModulePath)

    return ContainerService.factory(ctx, module, "ingress-controller")
  }

  private async getDefaultBackendService(ctx: GardenContext) {
    const module = <ContainerModule>await ctx.resolveModule(defaultBackendModulePath)

    return ContainerService.factory(ctx, module, "default-backend")
  }

  private async getDashboardService(ctx: GardenContext) {
    // TODO: implement raw kubernetes module load this module the same way as the ones above
    const module = new ContainerModule(ctx, {
      version: "0",
      name: "garden-dashboard",
      type: "container",
      path: dashboardModulePath,
      services: {
        "kubernetes-dashboard": {
          daemon: false,
          dependencies: [],
          endpoints: [],
          ports: {},
          volumes: [],
        },
      },
      variables: {},
      build: { dependencies: [] },
      test: {},
    })

    return Service.factory(ctx, module, "kubernetes-dashboard")
  }

  protected getProjectHostname() {
    // TODO: for remote Garden environments, this will depend on the configured project
    // TODO: make configurable for the generic kubernetes plugin
    return "local.app.garden"
  }

  protected getServiceHostname(ctx: GardenContext, service: ContainerService) {
    return `${service.name}.${ctx.projectName}.${this.getProjectHostname()}`
  }

  async checkDeploymentStatus(
    { ctx, service, resourceVersion, env }:
      { ctx: GardenContext, service: ContainerService, resourceVersion?: number, env?: Environment },
  ): Promise<ServiceStatus> {
    const type = service.config.daemon ? "daemonsets" : "deployments"
    const hostname = this.getServiceHostname(ctx, service)

    const namespace = this.getNamespaceName(ctx, env)

    const endpoints = service.config.endpoints.map((e: ServiceEndpointSpec) => {
      // TODO: this should be HTTPS, once we've set up TLS termination at the ingress controller level
      const protocol: ServiceProtocol = "http"

      return {
        protocol,
        hostname,
        port: localIngressPort,
        url: `${protocol}://${hostname}:${localIngressPort}`,
        paths: e.paths,
      }
    })

    const out: ServiceStatus = {
      endpoints,
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
      resourceVersion = out.detail.resourceVersion = parseInt(statusRes.metadata.resourceVersion, 10)
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

      if (message) {
        out.detail.lastMessage = message
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
    out.lastMessage = statusMsg

    return out
  }

  async waitForDeployment(
    { ctx, service, logEntry, env }:
      { ctx: GardenContext, service: ContainerService, logEntry?: LogEntry, env?: Environment },
  ) {
    // NOTE: using `kubectl rollout status` here didn't pan out, since it just times out when errors occur.
    let loops = 0
    let resourceVersion
    let lastMessage
    let lastDetailMessage
    const startTime = new Date().getTime()

    logEntry && ctx.log.verbose({
      symbol: LogSymbolType.info,
      section: service.name,
      msg: `Waiting for service to be ready...`,
    })

    while (true) {
      await sleep(2000 + 1000 * loops)

      const status = await this.checkDeploymentStatus({ ctx, service, resourceVersion, env })

      if (status.lastError) {
        throw new DeploymentError(`Error deploying ${service.name}: ${status.lastError}`, {
          serviceName: service.name,
          status,
        })
      }

      if (status.detail.lastMessage && status.detail.lastMessage !== lastDetailMessage) {
        lastDetailMessage = status.detail.lastMessage
        logEntry && ctx.log.verbose({
          symbol: LogSymbolType.info,
          section: service.name,
          msg: status.detail.lastMessage,
        })
      }

      if (status.lastMessage && status.lastMessage !== lastMessage) {
        lastMessage = status.lastMessage
        logEntry && ctx.log.verbose({
          symbol: LogSymbolType.info,
          section: service.name,
          msg: status.lastMessage,
        })
      }

      if (status.state === "ready") {
        break
      }

      resourceVersion = status.detail.resourceVersion

      const now = new Date().getTime()

      if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
        throw new Error(`Timed out waiting for ${service.name} to deploy`)
      }
    }

    logEntry && ctx.log.verbose({ symbol: LogSymbolType.info, section: service.name, msg: `Service deployed` })
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

  protected async apply(obj: any, { force = false, namespace }: { force?: boolean, namespace?: string } = {}) {
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

  //endregion
}

function getTestResultKey(module: ContainerModule, version: string) {
  return `test-result--${module.name}--${version}`
}

async function apiPostOrPut(api: any, name: string, body: object) {
  try {
    await api.post(body)
  } catch (err) {
    if (err.code === 409) {
      await api(name).put(body)
    } else {
      throw err
    }
  }
}

async function apiGetOrNull(api: any, name: string) {
  try {
    return await api(name).get()
  } catch (err) {
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}
