/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"

import type { ServiceState } from "@garden-io/core/build/src/types/service"
import type { ExecutionState } from "@garden-io/core/build/src/plugin/base"

import PageError from "../components/page-error"
import { ModuleCard, Props as ModuleProps } from "../components/entity-cards/module"
import EntityResult from "./entity-result"
import ViewIngress from "../components/view-ingress"
import { useApi, useUiState } from "../hooks"

const Overview = styled.div`
  padding: 1rem 0.5rem;
`

const Modules = styled.div`
  display: flex;
  flex-wrap: wrap;
  padding: 0 0 0 1rem;
`

export type Entity = {
  name?: string
  state?: ServiceState | ExecutionState
  dependencies: string[]
}

export default () => {
  const {
    store: {
      entities: { project, modules },
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

  // TODO-G2: make actions the top level instead of modules, and just annotate with module name as applicable

  const moduleProps: ModuleProps[] = Object.values(modules).map((module) => {
    // const serviceEntities = module.services.map((serviceName) => services[serviceName]).filter(Boolean)
    // const testEntities = module.tests.map((testKey) => tests[testKey]).filter(Boolean)
    // const taskEntities = module.tasks.map((taskName) => tasks[taskName]).filter(Boolean)

    return {
      name: module.name,
      type: module.type,
      disabled: module.disabled,
      path: project.root.split("/").pop() + module.path.replace(project.root, ""),
      repositoryUrl: module.repositoryUrl,
      description: module.description,
      serviceCardProps: [], // mapServices(serviceEntities),
      testCardProps: [], // mapTests(testEntities, module.name),
      taskCardProps: [], // mapTasksToProps(taskEntities, module.name),
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
              kind={selectedEntity.kind}
              moduleName={selectedEntity.module}
              onClose={clearSelectedEntity}
            />
          </div>
        )}
      </div>
    </Overview>
  )
}
