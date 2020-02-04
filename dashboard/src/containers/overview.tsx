/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"

import { RunState } from "garden-service/build/src/commands/get/get-status"
import { ServiceState } from "garden-service/build/src/types/service"

import PageError from "../components/page-error"
import { ModuleCard, Props as ModuleProps } from "../components/entity-cards/module"
import EntityResult from "./entity-result"
import ViewIngress from "../components/view-ingress"
import { Service, Test, Task, Module, useApi } from "../contexts/api"
import Spinner from "../components/spinner"
import { useUiState } from "../contexts/ui"
import { useConfig } from "../util/hooks"

const Overview = styled.div`
  padding-top: 0.5rem;
`

const Modules = styled.div`
  display: flex;
  flex-wrap: wrap;
  overflow-y: auto;
  max-height: calc(100vh - 2rem);
  padding: 0 0 0 1rem;
`

export type Entity = {
  name?: string
  state?: ServiceState | RunState
  dependencies: string[]
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
    dispatch,
    store: {
      entities: { project, modules, services, tests, tasks },
      requestStates,
    },
  } = useApi()

  const {
    state: {
      overview: { selectedIngress, selectedEntity },
    },
    actions: { selectEntity },
  } = useUiState()

  useConfig(dispatch, requestStates.config)

  const clearSelectedEntity = () => {
    selectEntity(null)
  }

  if (requestStates.config.error || requestStates.status.error) {
    return <PageError error={requestStates.config.error || requestStates.status.error} />
  }

  // Note that we don't call the loadStatus function here since the Sidebar ensures that the status is always loaded.
  // FIXME: We should be able to call loadStatus safely and have the handler check if the status
  // has already been fetched or is pending.
  if (!(requestStates.config.initLoadComplete && requestStates.status.initLoadComplete)) {
    return <Spinner />
  }

  const moduleProps: ModuleProps[] = Object.values(modules).map((module: Module) => {
    const serviceEntities = module.services.map((serviceKey) => services[serviceKey]).filter(Boolean)
    const testEntities = module.tests.map((testKey) => tests[testKey]).filter(Boolean)
    const taskEntities = module.tasks.map((taskKey) => tasks[taskKey]).filter(Boolean)

    return {
      name: module.name,
      type: module.type,
      path: project.root.split("/").pop() + module.path.replace(project.root, ""),
      repositoryUrl: module.repositoryUrl,
      description: module.description,
      serviceCardProps: mapServices(serviceEntities),
      testCardProps: mapTests(testEntities, module.name),
      taskCardProps: mapTasks(taskEntities, module.name),
      isLoading: requestStates.status.pending,
    }
  })

  return (
    <Overview>
      <div className="row">
        <div className="col-xs">
          <Modules>
            {moduleProps.map((props) => (
              <ModuleCard {...props} key={props.name} />
            ))}
          </Modules>
        </div>
        {selectedIngress && (
          <div className="col-lg visible-lg-block">{selectedIngress && <ViewIngress ingress={selectedIngress} />}</div>
        )}
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
    </Overview>
  )
}
