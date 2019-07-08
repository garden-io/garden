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
import { RunState } from "garden-cli/src/commands/get/get-status"
import Module from "../components/module"
import EntityResult from "./entity-result"
import { default as ViewIngress } from "../components/view-ingress"
import { DataContext, ServiceEntity, TestEntity, TaskEntity, ModuleEntity } from "../context/data"
import Spinner from "../components/spinner"
import { ServiceState } from "garden-cli/src/types/service"
import { UiStateContext } from "../context/ui"
import { getDuration } from "../util/helpers"

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

export type Module = {
  name?: string;
  type?: string;
  path?: string;
  repositoryUrl?: string;
  description?: string;
  services: Service[];
  tests: Test[];
  tasks: Task[];
}

export type Entity = {
  name?: string;
  state?: ServiceState | RunState;
  dependencies: string[];
}

export interface Service extends Entity {
  state?: ServiceState
  ingresses?: ServiceIngress[]
}

export interface Test extends Entity {
  startedAt?: Date
  completedAt?: Date
  duration?: string
  state?: RunState
}

export interface Task extends Entity {
  startedAt?: Date
  completedAt?: Date
  duration?: string
  state?: RunState
}

const mapServiceEntitiesToServices = (serviceEntities: ServiceEntity[]): Service[] => {
  return serviceEntities.map((serviceEntity) => ({
    name: serviceEntity.config.name,
    dependencies: serviceEntity.config.dependencies || [],
    state: serviceEntity.status && serviceEntity.status.state,
    ingresses: serviceEntity.status && serviceEntity.status.ingresses,
  }))
}

const mapTestEntitiesToTests = (testEntities: TestEntity[]): Test[] => {
  return testEntities.map((testEntity) => ({
    name: testEntity.config.name,
    dependencies: testEntity.config.dependencies || [],
    state: testEntity.status && testEntity.status.state,
    startedAt: testEntity.status && testEntity.status.startedAt,
    completedAt: testEntity.status && testEntity.status.completedAt,
    duration: testEntity.status &&
      testEntity.status.startedAt &&
      testEntity.status.completedAt &&
      getDuration(testEntity.status.startedAt,
        testEntity.status.completedAt),
  }))
}

const mapTaskEntitiesToTasks = (taskEntities: TaskEntity[]): Task[] => {
  return taskEntities.map((taskEntity) => ({
    name: taskEntity.config.name,
    dependencies: taskEntity.config.dependencies || [],
    state: taskEntity.status && taskEntity.status.state,
    startedAt: taskEntity.status && taskEntity.status.startedAt,
    completedAt: taskEntity.status && taskEntity.status.completedAt,
    duration: taskEntity.status && taskEntity.status.startedAt &&
      taskEntity.status.completedAt &&
      getDuration(taskEntity.status.startedAt,
        taskEntity.status.completedAt),
  }))
}

// Note: We render the overview page components individually so we that we don't
// have to wait for both API calls to return.
export default () => {
  const {
    store: {
      projectRoot,
      entities: { modules, services, tests, tasks },
      requestStates: { fetchConfig, fetchStatus },
    },
    actions: { loadConfig, loadStatus },
  } = useContext(DataContext)

  const {
    state: {
      overview: { selectedIngress, selectedEntity },
    },
    actions: {
      selectEntity,
    },
  } = useContext(UiStateContext)

  // TODO BEN: see if need to implement useAsyncEffect
  // https://dev.to/n1ru4l/homebrew-react-hooks-useasynceffect-or-how-to-handle-async-operations-with-useeffect-1fa8
  useEffect(() => {
    async function fetchData() {
      return await loadConfig()
    }
    // tslint:disable-next-line: no-floating-promises
    fetchData()
  }, [])

  useEffect(() => {
    async function fetchData() {
      return await loadStatus()
    }
    // tslint:disable-next-line: no-floating-promises
    fetchData()
  }, [])

  const clearSelectedEntity = () => {
    selectEntity(null)
  }

  let modulesContainerComponent: React.ReactNode = null
  let modulesFull: Module[] = []

  if (fetchConfig.error || fetchStatus.error) {
    modulesContainerComponent = <PageError error={fetchConfig.error || fetchStatus.error} />
  } else if (fetchConfig.loading) {
    modulesContainerComponent = <Spinner />
  } else if (modules) {
    modulesFull = Object
      .values(modules)
      .reduce((modulesHierarchical: Module[], moduleEntity: ModuleEntity) => {

        const moduleServiceEntities: ServiceEntity[] = services &&
          moduleEntity.services.map(serviceKey => services[serviceKey]) || []
        const moduleTestEntities: TestEntity[] = tests &&
          moduleEntity.tests.map(testKey => tests[testKey]) || []
        const moduleTaskEntities: TaskEntity[] = tasks &&
          moduleEntity.tasks.map(taskKey => tasks[taskKey]) || []

        return [
          ...modulesHierarchical,
          {
            name: moduleEntity.name,
            type: moduleEntity.type,
            path: projectRoot &&
              moduleEntity.path &&
              projectRoot.split("/").pop() +
              moduleEntity.path.replace(projectRoot, ""),
            repositoryUrl: moduleEntity.repositoryUrl,
            description: moduleEntity.description,
            services: mapServiceEntitiesToServices(moduleServiceEntities),
            tests: mapTestEntitiesToTests(moduleTestEntities),
            tasks: mapTaskEntitiesToTasks(moduleTaskEntities),
          },
        ]
      }, [])

    modulesContainerComponent = (
      <Overview>
        <div className="row">
          <div className="col-xs">
            <Modules>
              {modulesFull.map(module => (
                <Module
                  module={module}
                  key={module.name}
                  isLoadingEntities={fetchStatus.loading}
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

  return (
    <div>{modulesContainerComponent}</div>
  )
}
