/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"
import PageError from "../components/page-error"
import styled from "@emotion/styled"
import { ServiceIngress } from "garden-cli/src/types/service"
import Module from "../components/module"
import { DataContext } from "../context/data"
import Spinner from "../components/spinner"
import { ServiceState } from "garden-cli/src/types/service"

export const overviewConfig = {
  service: {
    height: "14rem",
  },
}

const Modules = styled.div`
  padding-top: 1rem;
  display: flex;
  flex-wrap: wrap;
`

export type ModuleModel = {
  name: string;
  services: ServiceModel[];
}
export type ServiceModel = {
  ingresses?: ServiceIngress[];
  name: string;
  state?: ServiceState;
  isLoading: boolean;
}

// Note: We render the overview page components individually so we that we don't
// have to wait for both API calls to return.
export default () => {
  const {
    actions: { loadConfig, loadStatus },
    store: { config, status },
  } = useContext(DataContext)

  useEffect(loadConfig, [])
  useEffect(loadStatus, [])

  const isLoadingConfig = !config.data || config.loading

  let modulesContainerComponent: React.ReactNode = null
  let modules: ModuleModel[] = []

  if (config.error || status.error) {
    modulesContainerComponent = <PageError error={config.error || status.error} />
  } else if (isLoadingConfig) {
    modulesContainerComponent = <Spinner />
  } else if (config.data && config.data.moduleConfigs) {

    // fill modules with services names
    modules = config.data.moduleConfigs.map(moduleConfig => ({
      name: moduleConfig.name,
      services: moduleConfig.serviceConfigs.map(service => ({
        name: service.name,
        isLoading: true,
      })),
    }))

    // fill missing data from status
    if (status.data && status.data.services) {
      const servicesStatus = status.data.services
      for (let currModule of modules) {
        for (let serviceName of Object.keys(servicesStatus)) {
          const index = currModule.services.findIndex(s => s.name === serviceName)

          if (index !== -1) {
            currModule.services[index] = {
              ...currModule.services[index],
              state: servicesStatus[serviceName].state,
              ingresses: servicesStatus[serviceName].ingresses,
              isLoading: false,
            } as ServiceModel
          }
        }
      }
    }

    modulesContainerComponent = (
      <Modules>
        {modules.map(module => (
          <Module module={module} key={module.name} />
        ))}
      </Modules>
    )
  }

  return (
    <div>{modulesContainerComponent}</div>
  )
}
