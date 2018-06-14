/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import {
  isEqual,
  set,
  zip,
} from "lodash"
import * as Joi from "joi"
import {
  GARDEN_ANNOTATION_KEYS_SERVICE,
  GARDEN_ANNOTATION_KEYS_VERSION,
} from "../../constants"
import {
  joiIdentifier,
  validate,
} from "../../types/common"
import {
  Module,
  ModuleSpec,
} from "../../types/module"
import {
  ParseModuleResult,
} from "../../types/plugin/outputs"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin/params"
import {
  Service,
  ServiceConfig,
  ServiceStatus,
} from "../../types/service"
import {
  TestConfig,
  TestSpec,
} from "../../types/test"
import { TreeVersion } from "../../vcs/base"
import {
  applyMany,
} from "./kubectl"
import { getAppNamespace } from "./namespace"
import { coreApi, extensionsApi, rbacApi } from "./api"
import { KubernetesProvider } from "./kubernetes"
import { PluginContext } from "../../plugin-context"
import { ConfigurationError } from "../../exceptions"

export interface KubernetesSpecsModuleSpec extends ModuleSpec {
  specs: any[],
}

export interface KubernetesSpecsServiceSpec extends KubernetesSpecsModuleSpec { }

export class KubernetesSpecsModule extends Module<KubernetesSpecsModuleSpec, KubernetesSpecsServiceSpec> { }

export interface K8sSpec {
  apiVersion: string
  kind: string
  metadata: {
    annotations?: object,
    name: string,
    namespace?: string,
    labels?: object,
  }
}

// TODO: use actual k8s swagger schemas from @kubernetes/client-node to validate
const k8sSpecSchema = Joi.object().keys({
  apiVersion: Joi.string().required(),
  kind: Joi.string().required(),
  metadata: Joi.object().keys({
    annotations: Joi.object(),
    name: joiIdentifier().required(),
    namespace: joiIdentifier(),
    labels: Joi.object(),
  }).required().unknown(true),
}).unknown(true)

const k8sSpecsSchema = Joi.array().items(k8sSpecSchema).min(1)

export const kubernetesSpecHandlers = {
  async parseModule({ moduleConfig }: ParseModuleParams<KubernetesSpecsModule>): Promise<ParseModuleResult> {
    // TODO: check that each spec namespace is the same as on the project, if specified
    const services: ServiceConfig<KubernetesSpecsServiceSpec>[] = [{
      name: moduleConfig.name,
      dependencies: [],
      outputs: {},
      spec: {
        specs: validate(moduleConfig.spec.specs, k8sSpecsSchema, { context: `${moduleConfig.name} kubernetes specs` }),
      },
    }]

    const tests: TestConfig<TestSpec>[] = []

    return {
      module: moduleConfig,
      services,
      tests,
    }
  },

  getServiceStatus: async (
    { ctx, provider, service }: GetServiceStatusParams<KubernetesSpecsModule>,
  ): Promise<ServiceStatus> => {
    const namespace = await getAppNamespace(ctx, provider)
    const currentVersion = await service.module.getVersion()
    const specs = await prepareSpecs(service, namespace, currentVersion)

    const existingSpecs = await Bluebird.map(specs, spec => getSpec(ctx, provider, spec))

    for (const [spec, existingSpec] of zip(specs, existingSpecs)) {
      const lastApplied = existingSpec && JSON.parse(
        existingSpec.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"],
      )

      if (!isEqual(spec, lastApplied)) {
        // TODO: return more complete information. for now we just need to signal whether the deployed specs are current
        return {}
      }
    }

    return { state: "ready" }
  },

  deployService: async ({ ctx, provider, service }: DeployServiceParams<KubernetesSpecsModule>) => {
    const context = provider.config.context
    const namespace = await getAppNamespace(ctx, provider)
    const currentVersion = await service.module.getVersion()
    const specs = await prepareSpecs(service, namespace, currentVersion)

    await applyMany(context, specs, { namespace, pruneSelector: `${GARDEN_ANNOTATION_KEYS_SERVICE}=${service.name}` })

    return {}
  },
}

async function prepareSpecs(service: Service<KubernetesSpecsModule>, namespace: string, version: TreeVersion) {
  return service.module.spec.specs.map((rawSpec) => {
    const spec = {
      metadata: {},
      ...rawSpec,
    }

    spec.metadata.namespace = namespace

    set(spec, ["metadata", "annotations", GARDEN_ANNOTATION_KEYS_VERSION], version.versionString)
    set(spec, ["metadata", "annotations", GARDEN_ANNOTATION_KEYS_SERVICE], service.name)
    set(spec, ["metadata", "labels", GARDEN_ANNOTATION_KEYS_SERVICE], service.name)

    return spec
  })
}

async function apiReadBySpec(ctx: PluginContext, provider: KubernetesProvider, spec: K8sSpec) {
  // this is just awful, sorry. any better ideas? - JE
  const context = provider.config.context
  const namespace = await getAppNamespace(ctx, provider)
  const name = spec.metadata.name

  const core = coreApi(context)
  const ext = extensionsApi(context)
  const rbac = rbacApi(context)

  switch (spec.kind) {
    case "ConfigMap":
      return core.readNamespacedConfigMap(name, namespace)
    case "Endpoints":
      return core.readNamespacedEndpoints(name, namespace)
    case "LimitRange":
      return core.readNamespacedLimitRange(name, namespace)
    case "PersistentVolumeClaim":
      return core.readNamespacedPersistentVolumeClaim(name, namespace)
    case "Pod":
      return core.readNamespacedPod(name, namespace)
    case "PodTemplate":
      return core.readNamespacedPodTemplate(name, namespace)
    case "ReplicationController":
      return core.readNamespacedReplicationController(name, namespace)
    case "ResourceQuota":
      return core.readNamespacedResourceQuota(name, namespace)
    case "Secret":
      return core.readNamespacedSecret(name, namespace)
    case "Service":
      return core.readNamespacedService(name, namespace)
    case "ServiceAccount":
      return core.readNamespacedServiceAccount(name, namespace)
    case "DaemonSet":
      return ext.readNamespacedDaemonSet(name, namespace)
    case "Deployment":
      return ext.readNamespacedDeployment(name, namespace)
    case "Ingress":
      return ext.readNamespacedIngress(name, namespace)
    case "ReplicaSet":
      return ext.readNamespacedReplicaSet(name, namespace)
    case "Role":
      return rbac.readNamespacedRole(name, namespace)
    case "RoleBinding":
      return rbac.readNamespacedRoleBinding(name, namespace)
    default:
      throw new ConfigurationError(`Unsupported Kubernetes spec kind: ${spec.kind}`, {
        spec,
      })
  }
}

async function getSpec(ctx: PluginContext, provider: KubernetesProvider, spec: K8sSpec) {
  try {
    const res = await apiReadBySpec(ctx, provider, spec)
    return res.body
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}
