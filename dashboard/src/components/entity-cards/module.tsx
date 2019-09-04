/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState } from "react"
import styled from "@emotion/styled"

import { Omit } from "garden-service/build/src/util/util"

import { useUiState } from "../../contexts/ui"
import { TestCard, Props as TestCardProps } from "./test-card"
import { TaskCard, Props as TaskCardProps } from "./task"
import { ServiceCard, Props as ServiceCardProps } from "./service"
import { Module } from "../../contexts/api"
import { Field, Value, FieldWrap } from "./common"

const Wrap = styled.div`
  padding: 1.2rem;
  background: white;
  box-shadow: 0rem 0.375rem 1.125rem rgba(0, 0, 0, 0.06);
  border-radius: 0.25rem;
  margin: 0 1.3rem 1.3rem 0;
  min-width: 17.5rem;
  flex: 1 1;
  max-width: 20rem;
`

type CardWrapProps = {
  visible: boolean
}

const CardWrap = styled.div<CardWrapProps>`
  padding-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: middle;
  display: ${(props) => (props.visible ? `block` : "none")};
  animation: fadein 0.5s;

  @keyframes fadein {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const Header = styled.div`
  line-height: 1rem;
  display: flex;
  align-items: baseline;
  align-self: flex-start;
  justify-content: space-between;
`

const Name = styled.div`
  font-weight: 500;
  font-size: 0.9375rem;
  letter-spacing: 0.01em;
  color: #323c47;
`

const Tag = styled.div`
  padding-left: 0.5rem;
  font-weight: 500;
  font-size: 0.625rem;
  letter-spacing: 0.01em;
  color: #90a0b7;
`

const Description = styled(Field)`
  color: #4c5862;
  opacity: 0.5;
  padding-top: 0.25rem;
`

const Full = styled(Value)`
  cursor: pointer;
`

const Short = styled(Value)`
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

export type Props = Pick<Module, "name" | "type" | "path" | "repositoryUrl" | "description"> & {
  serviceCardProps: Omit<ServiceCardProps, "isLoading" | "showInfo">[]
  testCardProps: Omit<TestCardProps, "isLoading" | "showInfo" | "onEntitySelected">[]
  taskCardProps: Omit<TaskCardProps, "isLoading" | "showInfo" | "onEntitySelected">[]
  isLoading: boolean
}

export const ModuleCard = ({
  serviceCardProps = [],
  testCardProps = [],
  taskCardProps = [],
  name,
  type,
  description,
  isLoading,
}: Props) => {
  const {
    state: {
      overview: { filters },
    },
    actions: { selectEntity },
  } = useUiState()

  const [isValueExpended, setValueExpendedState] = useState(false)
  const toggleValueExpendedState = () => setValueExpendedState(!isValueExpended)

  return (
    <Wrap>
      <Header>
        <Name>{name}</Name>
        <Tag>{type && type.toUpperCase()} MODULE</Tag>
      </Header>
      <FieldWrap visible={filters.modulesInfo}>
        <Description visible={!!description}>
          {!isValueExpended && <Short onClick={toggleValueExpendedState}>{description}</Short>}
          {isValueExpended && <Full onClick={toggleValueExpendedState}>{description}</Full>}
        </Description>
      </FieldWrap>
      <CardWrap visible={filters.services && serviceCardProps.length > 0}>
        {serviceCardProps.map((props) => (
          <ServiceCard {...props} isLoading={isLoading} key={props.name} showInfo={filters.servicesInfo} />
        ))}
      </CardWrap>
      <CardWrap visible={filters.tests && testCardProps.length > 0}>
        {testCardProps.map((props) => (
          <TestCard
            {...props}
            isLoading={isLoading}
            key={props.name}
            onEntitySelected={selectEntity}
            showInfo={filters.testsInfo}
          />
        ))}
      </CardWrap>
      <CardWrap visible={filters.tasks && taskCardProps.length > 0}>
        {taskCardProps.map((props) => (
          <TaskCard
            {...props}
            isLoading={isLoading}
            key={props.name}
            showInfo={filters.tasksInfo}
            onEntitySelected={selectEntity}
          />
        ))}
      </CardWrap>
    </Wrap>
  )
}
