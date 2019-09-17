/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect } from "react"
import styled from "@emotion/styled"

import { RunState } from "garden-service/build/src/commands/get/get-status"
import { ServiceState } from "garden-service/build/src/types/service"

import PageError from "../components/page-error"
import { ModuleCard, Props as ModuleProps } from "../components/entity-cards/module"
import EntityResult from "./entity-result"
import ViewIngress from "../components/view-ingress"
import {
  Service,
  Test,
  Task,
  Module,
  useApi,
} from "../contexts/api"
import Spinner from "../components/spinner"
import { useUiState } from "../contexts/ui"

const Overview = styled.div`
  padding-top: .5rem;
`

const Modules = styled.div`
  display: flex;
  flex-wrap: wrap;
  overflow-y: scroll;
  max-height: calc(100vh - 2rem);
  padding: 0 0 0 1rem;
`

export type Entity = {
  name?: string;
  state?: ServiceState | RunState;
  dependencies: string[];
}

const mapServices = (serviceEntities: Service[]): ModuleProps["serviceCardProps"] => {
  return serviceEntities.map(({ config, status }) => ({
    name: config.name,
    dependencies: config.dependencies || [],
    state: status.state,
    ingresses: status.ingresses,
  }))
}

const mapTests = (testEntities: Test[], moduleName: string): ModuleProps["testCardProps"] => {
  return testEntities.map(({ config, status }) => ({
    name: config.name,
    dependencies: config.dependencies || [],
    state: status.state,
    startedAt: status.startedAt,
    completedAt: status.completedAt,
    moduleName,
  }))
}

const mapTasks = (taskEntities: Task[], moduleName: string): ModuleProps["taskCardProps"] => {
  return taskEntities.map(({ config, status }) => ({
    name: config.name,
    dependencies: config.dependencies || [],
    state: status.state,
    startedAt: status.startedAt,
    completedAt: status.completedAt,
    moduleName,
  }))
}

export default () => {
  const {
    store: {
      projectRoot,
      entities: { modules, services, tests, tasks },
      requestStates: { fetchConfig, fetchStatus },
    },
    actions: { loadConfig, loadStatus },
  } = useApi()

  const {
    state: {
      overview: { selectedIngress, selectedEntity },
    },
    actions: {
      selectEntity,
    },
  } = useUiState()

  // TODO use useAsyncEffect?
  // https://dev.to/n1ru4l/homebrew-react-hooks-useasynceffect-or-how-to-handle-async-operations-with-useeffect-1fa8
  useEffect(() => {
    async function fetchData() {
      return await loadConfig()
    }
    fetchData()
  }, [])

  useEffect(() => {
    async function fetchData() {
      return await loadStatus()
    }
    fetchData()
  }, [])

  const clearSelectedEntity = () => {
    selectEntity(null)
  }

  if (fetchConfig.error || fetchStatus.error) {
    return <PageError error={fetchConfig.error || fetchStatus.error} />
  }

  if (fetchConfig.loading || fetchStatus.loading) {
    return <Spinner />
  }

  const moduleProps: ModuleProps[] = Object.values(modules).map((module: Module) => {
    const serviceEntities = module.services.map(serviceKey => services[serviceKey]) || []
    const testEntities = module.tests.map(testKey => tests[testKey]) || []
    const taskEntities = module.tasks.map(taskKey => tasks[taskKey]) || []

    return {
      name: module.name,
      type: module.type,
      path: projectRoot.split("/").pop() + module.path.replace(projectRoot, ""),
      repositoryUrl: module.repositoryUrl,
      description: module.description,
      serviceCardProps: mapServices(serviceEntities),
      testCardProps: mapTests(testEntities, module.name),
      taskCardProps: mapTasks(taskEntities, module.name),
      isLoading: fetchStatus.loading,
    }
  })

  return (
    <Overview>
      <div className="row">
        <div className="col-xs">
          <Modules>
            {moduleProps.map(props => (
              <ModuleCard
                {...props}
                key={props.name}
              />
            ))}
          </Modules>
        </div>
        {selectedIngress &&
          <div className="col-lg visible-lg-block">
            {selectedIngress &&
              <ViewIngress ingress={selectedIngress} />
            }
          </div>
        }
        {selectedEntity && (
          <div className="col-xs-5 col-sm-5 col-md-4 col-lg-4 col-xl-4">
            <EntityResult
              name={selectedEntity.name}
              type={selectedEntity.type}
              moduleName={selectedEntity.module}
              onClose={clearSelectedEntity}
            />
          </div>
        )}
      </div>
    </Overview >
  )
}
