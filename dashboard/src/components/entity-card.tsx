/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import moment from "moment"
import { colors } from "../styles/variables"
import { Facebook as ContentLoader } from "react-content-loader"
import { Fields, Field, Key, Value, FieldGroup } from "./module"
import Ingresses from "./ingresses"
import { getDuration } from "../util/helpers"
import { TertiaryButton } from "./button"
import { css } from "emotion"
import { Service, Test, Task } from "../containers/overview"
import { SelectEntity } from "../context/ui"

const Card = styled.div`
  max-height: 13rem;
  background-color: white;
  margin-right: 1rem;
  box-shadow: 2px 2px 9px rgba(0,0,0,0.14);
  border-radius: 4px;
  width: 100%;
  margin-top: 1rem;
  padding: .75rem;

  &:first-of-type {
    margin-top: 0;
  }

  &:last-of-type {
    margin-right: 0;
  }
`

const Header = styled.div`
  width: 100%;
  display:flex;
  justify-content: space-between;
`

const Content = styled.div`
  width: 100%;
  position: relative;
  max-height: 10rem;
  padding-top: .75rem;
  &:empty
  {
      display:none;
  }
`

type StateContainerProps = {
  state: string,
}
const StateContainer = styled.div<StateContainerProps>`
  padding: 0 .5rem;
  margin-left: auto;
  background-color: ${props => (props && props.state ? colors.state[props.state] : colors.gardenGrayLight)};
  display: ${props => (props && props.state && colors.state[props.state] ? "flex" : "none")};
  align-items: center;
  border-radius: 0.25rem;
  font-weight: 500;
  font-size: 0.6875rem;
  line-height: 1rem;
  text-align: center;
  letter-spacing: 0.02em;
  color: #FFFFFF;
  height: 1rem;
`

const Tag = styled.div`
  display: flex;
  align-items: center;
  font-weight: 500;
  font-size: 10px;
  line-height: 10px;
  text-align: right;
  letter-spacing: 0.01em;
  color: #90A0B7;
`

const Name = styled.div`
  font-size: 0.9375rem;
  font-weight: 500;
  color: rgba(0, 0, 0, .87);
  padding-top: 0.125rem;
`

interface ServiceCardProps {
  service: Service,
  isLoading: boolean,
  showInfo: boolean,
}

export const ServiceCard = ({
  service: {
    name,
    dependencies,
    ingresses,
    state,
  },
  isLoading,
  showInfo,
}: ServiceCardProps) => {

  return (
    <Card>
      <Header>
        <div>
          <Tag>SERVICE</Tag>
          <Name>{name}</Name>
        </div>
        {state && (
          <StateContainer state={state}>
            {state}
          </StateContainer>
        )}
      </Header>
      <Content>
        {isLoading && (
          <ContentLoader height={100} />
        )}
        {!isLoading && (
          <Fields visible={showInfo}>
            <Field inline visible={dependencies.length > 0}>
              <Key>Depends on:</Key>
              <Value>{dependencies.join(", ")}</Value>
            </Field>
            <Field visible={!!ingresses && ingresses.length > 0}>
              <Ingresses ingresses={ingresses} />
            </Field>
          </Fields>
        )}
      </Content>
    </Card>
  )
}

interface TaskCardProp {
  task: Task,
  moduleName?: string,
  isLoading: boolean,
  showInfo: boolean,
  onEntitySelected: SelectEntity,
}

export const TaskCard = ({
  task: {
    name,
    dependencies,
    state,
    startedAt,
    completedAt,
  },
  moduleName,
  isLoading,
  showInfo,
  onEntitySelected,
}: TaskCardProp) => {
  const duration = startedAt &&
    completedAt &&
    getDuration(startedAt, completedAt)

  const handleEntitySelected = () => {
    if (moduleName && name) {
      onEntitySelected({
        type: "task",
        name,
        module: moduleName,
      })
    }
  }

  return (
    <Card>
      <Header>
        <div>
          <Tag>TASK</Tag>
          <Name>{name}</Name>
        </div>
        {state && (
          <StateContainer state={state}>
            {state}
          </StateContainer>
        )}
      </Header>
      <Content>
        {isLoading && (
          <ContentLoader height={100} />
        )}
        {!isLoading && (
          <Fields visible={showInfo}>
            <Field inline visible={dependencies.length > 0}>
              <Key>Depends on:</Key>
              <Value>{dependencies.join(", ")}</Value>
            </Field>
            <FieldGroup
              className="row between-xs middle-xs"
              visible={!!startedAt}
            >
              <Field inline className="col-xs" visible={!!startedAt}>
                <Key>Ran:</Key>
                <Value>{moment(startedAt).fromNow()}</Value>
              </Field>
              <Field inline visible={state === "succeeded"}>
                <Key>Took:</Key>
                <Value>{duration}</Value>
              </Field>
            </FieldGroup>
            <div className="row">
              <div className="col-xs">
                <TertiaryButton
                  onClick={handleEntitySelected}
                  className={css`
                    margin-top: .5rem;
                  `}
                >
                  Show result
                </TertiaryButton>
              </div>
            </div>
          </Fields>
        )}
      </Content>
    </Card>
  )
}

interface TestCardProp {
  test: Test,
  moduleName?: string,
  isLoading: boolean,
  showInfo: boolean,
  onEntitySelected: SelectEntity
}

export const TestCard = ({
  test: {
    name,
    dependencies,
    state, startedAt, completedAt,
  },
  moduleName,
  isLoading,
  showInfo,
  onEntitySelected,
}: TestCardProp) => {
  const duration = startedAt &&
    completedAt &&
    getDuration(startedAt, completedAt)

  const handleEntitySelected = () => {
    if (moduleName && name) {
      onEntitySelected({
        type: "test",
        name,
        module: moduleName,
      })
    }
  }

  return (
    <Card>
      <Header>
        <div>
          <Tag>TEST</Tag>
          <Name>{name}</Name>
        </div>
        {state && (
          <StateContainer state={state}>
            {state}
          </StateContainer>
        )}
      </Header>
      <Content>
        {isLoading && (
          <ContentLoader height={100} />
        )}
        {!isLoading && (
          <Fields visible={showInfo}>
            <Field inline visible={dependencies.length > 0}>
              <Key>Depends on:</Key>
              <Value>{dependencies.join(", ")}</Value>
            </Field>
            <FieldGroup
              className="row between-xs middle-xs"
              visible={!!startedAt}
            >
              <Field inline className="col-xs" visible={!!startedAt}>
                <Key>Ran:</Key>
                <Value>{moment(startedAt).fromNow()}</Value>
              </Field>
              <Field inline visible={state === "succeeded"}>
                <Key>Took:</Key>
                <Value>{duration}</Value>
              </Field>
            </FieldGroup>
            <div className="row">
              <div className="col-xs">
                <TertiaryButton
                  onClick={handleEntitySelected}
                  className={css`
                    margin-top: .5rem;
                  `}
                >
                  Show result
                </TertiaryButton>
              </div>
            </div>
          </Fields>
        )}
      </Content>
    </Card>
  )
}
