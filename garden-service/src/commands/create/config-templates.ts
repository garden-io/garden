/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { capitalize, camelCase, uniq } from "lodash"

import { DeepPartial } from "../../util/util"
import { ContainerModuleSpec } from "../../plugins/container/config"
import { GcfModuleSpec } from "../../plugins/google/google-cloud-functions"
import { ProjectConfig } from "../../config/project"
import { ModuleConfig } from "../../config/module"

/**
 * Ideally there would be some mechanism to discover available module types,
 * and for plugins to expose a minimal config for the given type along with
 * a list of providers per environment, rather than hard coding these values.
 *
 * Alternatively, consider co-locating the templates with the plugins.
 */
export const MODULE_PROVIDER_MAP = {
  "container": "local-kubernetes",
  "google-cloud-function": "local-google-cloud-functions",
  "npm-package": "npm-package",
}

export const availableModuleTypes = <ModuleType[]>Object.keys(MODULE_PROVIDER_MAP)

export type ModuleType = keyof typeof MODULE_PROVIDER_MAP

export interface ProjectTemplate {
  project: Partial<ProjectConfig>
}

export interface ModuleTemplate {
  module: Partial<ModuleConfig>
}

const noCase = (str: string) => str.replace(/-|_/g, " ")
const titleize = (str: string) => capitalize(noCase(str))

export function containerTemplate(moduleName: string): DeepPartial<ContainerModuleSpec> {
  return {
    services: [
      {
        name: `${moduleName}-service`,
        ports: [{
          name: "http",
          containerPort: 8080,
        }],
        ingresses: [{
          path: "/",
          port: "http",
        }],
      },
    ],
  }
}

export function googleCloudFunctionTemplate(moduleName: string): DeepPartial<GcfModuleSpec> {
  return {
    functions: [{
      name: `${moduleName}-google-cloud-function`,
      entrypoint: camelCase(`${moduleName}-google-cloud-function`),
    }],
  }
}

export function npmPackageTemplate(_moduleName: string): any {
  return {}
}

export const projectTemplate = (name: string, moduleTypes: ModuleType[]): ProjectTemplate => {
  const providers = uniq(moduleTypes).map(type => ({ name: MODULE_PROVIDER_MAP[type] }))
  return {
    project: {
      name,
      environments: [
        {
          name: "local",
          providers,
          variables: {},
        },
      ],
    },
  }
}

export const moduleTemplate = (name: string, type: ModuleType): ModuleTemplate => {
  const moduleTypeTemplate = {
    "container": containerTemplate,
    "google-cloud-function": googleCloudFunctionTemplate,
    "npm-package": npmPackageTemplate,
  }[type]
  return {
    module: {
      name,
      type,
      description: `${titleize(name)} ${noCase(type)}`,
      ...moduleTypeTemplate(name),
    },
  }
}
