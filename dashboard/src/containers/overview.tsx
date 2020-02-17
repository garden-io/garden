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
import { ServiceEntity, TestEntity, TaskEntity, useApi } from "../contexts/api"
import { useUiState } from "../contexts/ui"

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

const mapServices = (serviceEntities: ServiceEntity[]): ModuleProps["serviceCardProps"] => {
  return serviceEntities.map(({ config, status }) => ({
    name: config.name,
    dependencies: config.dependencies || [],
    state: status ? status.state : "missing",
    disabled: config.disabled || config.moduleDisabled,
    ingresses: status ? status.ingresses : [],
  }))
}

const mapTests = (testEntities: TestEntity[], moduleName: string): ModuleProps["testCardProps"] => {
  return testEntities.map(({ config, status }) => ({
    name: config.name,
    dependencies: config.dependencies || [],
    state: status.state,
    startedAt: status.startedAt,
    completedAt: status.completedAt,
    disabled: config.disabled || config.moduleDisabled,
    moduleName,
  }))
}

const mapTasksToProps = (taskConfigs: TaskEntity[], moduleName: string): ModuleProps["taskCardProps"] => {
  return taskConfigs.map(({ config, status }) => ({
    name: config.name,
    dependencies: config.dependencies || [],
    state: status.state,
    startedAt: status.startedAt,
    completedAt: status.completedAt,
    disabled: config.disabled || config.moduleDisabled,
    moduleName,
  }))
}

export default () => {
  const {
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

  const clearSelectedEntity = () => {
    selectEntity(null)
  }

  if (requestStates.status.error) {
    return <PageError error={requestStates.status.error} />
  }

  const moduleProps: ModuleProps[] = Object.values(modules).map((module) => {
    const serviceEntities = module.services.map((serviceName) => services[serviceName]).filter(Boolean)
    const testEntities = module.tests.map((testKey) => tests[testKey]).filter(Boolean)
    const taskEntities = module.tasks.map((taskName) => tasks[taskName]).filter(Boolean)

    return {
      name: module.name,
      type: module.type,
      disabled: module.disabled,
      path: project.root.split("/").pop() + module.path.replace(project.root, ""),
      repositoryUrl: module.repositoryUrl,
      description: module.description,
      serviceCardProps: mapServices(serviceEntities),
      testCardProps: mapTests(testEntities, module.name),
      taskCardProps: mapTasksToProps(taskEntities, module.name),
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
