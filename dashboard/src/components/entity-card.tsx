/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { ReactNode } from "react"
import styled from "@emotion/styled"
import { Entity } from "../containers/overview"
import { colors } from "../styles/variables"
import { Facebook as ContentLoader } from "react-content-loader"

interface EntityCardProps {
  type: EntityType
}
const EntityCard = styled.div<EntityCardProps>`
  max-height: 13rem;
  background-color: ${props => (props && props.type && colors.cardTypes[props.type] || "white")};
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
  align-items: center;
  justify-content: space-between;
`

const Content = styled.div`
  width: 100%;
  position: relative;
  max-height: 10rem;
  padding-top: .5rem;
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
  font-size: 0.66rem;
  line-height: 1.4em;
  text-align: center;
  letter-spacing: 0.02em;
  color: #FFFFFF;
  height: 1rem;
`

const Tag = styled.span`
  align-items: center;
  font-weight: 500;
  font-size: 10px;
  line-height: 10px;
  text-align: right;
  letter-spacing: 0.01em;
  color: #90A0B7;
  padding-left: .25rem;
`

const Name = styled.div`
  font-size: 1rem;
  font-weight: 500;
  color: rgba(0, 0, 0, .87);
`

type EntityType = "service" | "test" | "task"

interface Props {
  type: EntityType
  children: ReactNode
  entity: Entity
}

export default ({
  children,
  type,
  entity: { name, isLoading, state },
}: Props) => {

  return (
    <EntityCard type={type}>
      <Header>
        <div>
          <Name>{name} <Tag>{type.toUpperCase()}</Tag></Name>
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
        {!isLoading && children}
      </Content>
    </EntityCard>
  )
}
