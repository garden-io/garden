/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// These plugins are always registered and the providers documented
export const getSupportedPlugins = () => [
  {
    name: "container",
    callback: async () => {
      const plugin = await import("./container/container.js")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "exec",
    callback: async () => {
      const plugin = await import("./exec/exec.js")
      await plugin.initializeActionTypes()
      return plugin.gardenPlugin.getSpec()
    },
  },
  {
    name: "hadolint",
    callback: async () => {
      const plugin = await import("./hadolint/hadolint.js")
      return plugin.gardenPlugin.getSpec()
    },
  },
  {
    name: "kubernetes",
    callback: async () => {
      const plugin = await import("./kubernetes/kubernetes.js")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "local-kubernetes",
    callback: async () => {
      const plugin = await import("./kubernetes/local/local.js")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "ephemeral-kubernetes",
    callback: async () => {
      const plugin = await import("./kubernetes/ephemeral/ephemeral.js")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "openshift",
    callback: async () => {
      const plugin = await import("./openshift/openshift.js")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "octant",
    callback: async () => {
      const plugin = await import("./octant/octant.js")
      return plugin.gardenPlugin()
    },
  },
  {
    name: "otel-collector",
    callback: async () => {
      const plugin = await import("./otel-collector/otel-collector.js")
      return plugin.gardenPlugin.getSpec()
    },
  },
]

// These plugins are always registered
export const getBuiltinPlugins = () =>
  getSupportedPlugins().concat([
    {
      name: "templated",
      callback: async () => {
        const plugin = await import("./templated.js")
        return plugin.gardenPlugin()
      },
    },
  ])
