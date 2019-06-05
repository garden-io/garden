/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState, useContext } from "react"
import styled from "@emotion/styled"
import { ModuleModel } from "../containers/overview"
import InfoCard from "./info-card"
import { UiStateContext } from "../context/ui"
import Ingresses from "./ingresses"
import moment from "moment"

const Module = styled.div`
  padding: 1.2rem;
  background: white;
  box-shadow: 0px 6px 18px rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  margin: 0 1.3rem 1.3rem 0;
  min-width: 17rem;
  flex: 1 1;
  max-width: 20rem;
`

type InfoCardsProps = {
  visible: boolean,
}
const InfoCards = styled.div<InfoCardsProps>`
  padding-top: .75rem;
  display: flex;
  flex-wrap: wrap;
  align-items: middle;
  display: ${props => (props.visible ? `block` : "none")};
  animation: fadein .5s ;

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
  display: flex;
  align-items: center;
  align-self: flex-start;
`

type FieldsProps = {
  visible: boolean,
}
const Fields = styled.div<FieldsProps>`
  display: ${props => (props.visible ? `block` : "none")};
  animation: fadein .5s ;

  &:first-of-type{
    padding-top:0;
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

type FieldProps = {
  inline?: boolean,
}
const Field = styled.div<FieldProps>`
  display: ${props => (props.inline ? "inline" : "block")};
  padding-bottom: .5rem;

  &:last-of-type{
    padding-bottom: 0;
  }
`

const Tag = styled.div`
  display: inline-block;
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.01em;
  color: #90A0B7;
  padding-left: .25rem;
`
const Name = styled.div`
  padding-right: .5rem;
  font-weight: 500;
  font-size: 15px;
  letter-spacing: 0.01em;
  color: #323C47;
`

const Key = styled.span`
  padding-right: .25rem;
  font-size: 13px;
  line-height: 19px;
  letter-spacing: 0.01em;
  color: #4C5862;
  opacity: 0.5;
`
const Value = styled.span`
  padding-right: .5rem;
  font-size: 13px;
  line-height: 19px;
  letter-spacing: 0.01em;
  color: #4C5862;
`

const UrlFull = styled(Value)`
  overflow-wrap: break-word;
  word-wrap: break-word;
  -ms-word-break: break-all;
  word-break: break-all;
  word-break: break-word;
  -ms-hyphens: auto;
  -moz-hyphens: auto;
  -webkit-hyphens: auto;
  hyphens: auto;
  cursor: pointer;
`
const Description = styled(Field)`
  padding-top: 0.25rem;
`

const UrlShort = styled(Value)`
    padding-right: .5rem;
    font-size: 13px;
    line-height: 19px;
    letter-spacing: 0.01em;
    color: #4C5862;
    cursor: pointer;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`
interface ModuleProp {
  module: ModuleModel
}
export default ({
  module: { services = [], tests = [], tasks = [], name, type, description },
}: ModuleProp) => {
  const {
    state: { overview: { filters } },
  } = useContext(UiStateContext)

  const [showFullDescription, setDescriptionState] = useState(false)
  const toggleDescriptionState = () => (setDescriptionState(!showFullDescription))

  return (
    <Module>
      <Header>
        <Name>{name} <Tag>{type && type.toUpperCase()} MODULE</Tag></Name>
      </Header>
      <Fields visible={filters.modulesInfo}>
        {description && (
          <Description>
            {!showFullDescription && (
              <UrlShort onClick={toggleDescriptionState}>{description}</UrlShort>
            )}
            {showFullDescription && (
              <UrlFull onClick={toggleDescriptionState}>{description}</UrlFull>
            )}
          </Description>
        )}
      </Fields>
      <InfoCards visible={filters.services && !!services.length}>
        {services.map(service => (
          <InfoCard
            key={service.name}
            entity={service}
            type={"service"}
          >
            <Fields visible={filters.servicesInfo}>
              {service.dependencies.length > 0 && (
                <Field>
                  <Key>Depends on:</Key>
                  <Value>{service.dependencies.join(", ")}</Value>
                </Field>
              )}
              <Field>
                <Ingresses ingresses={service.ingresses} />
              </Field>
            </Fields>
          </InfoCard>
        ))}
      </InfoCards>
      <InfoCards visible={filters.tests && !!tests.length}>
        {tests.map(test => (
          <InfoCard
            key={test.name}
            entity={test}
            type={"test"}
          >
            <Fields visible={filters.testsInfo}>
              {test.dependencies.length > 0 && (
                <Field>
                  <Key>Depends on:</Key>
                  <Value>{test.dependencies.join(", ")}</Value>
                </Field>
              )}
              <div className="row between-xs" >
                <Field className="col-xs" inline>
                  <Key>Ran:</Key>
                  <Value>{moment(test.startedAt).fromNow()}</Value>
                </Field>
                {test.state === "succeeded" &&
                  <Field inline>
                    <Key>Took:</Key>
                    <Value>{test.duration}</Value>
                  </Field>
                }
              </div>
            </Fields>
          </InfoCard>
        ))}
      </InfoCards>
      <InfoCards visible={filters.tasks && !!tasks.length}>
        {tasks.map(task => (
          <InfoCard
            key={task.name}
            entity={task}
            type={"task"}
          >
            <Fields visible={filters.tasksInfo}>
              {task.dependencies.length && (
                <Field>
                  <Key>Depends on:</Key>
                  <Value>{task.dependencies.join(", ")}</Value>
                </Field>
              )}
              <div className="row between-xs" >
                <Field className="col-xs" inline>
                  <Key>Ran:</Key>
                  <Value>{moment(task.startedAt).fromNow()}</Value>
                </Field>
                {task.state === "succeeded" &&
                  <Field inline>
                    <Key>Took:</Key>
                    <Value>{task.duration}</Value>
                  </Field>
                }
              </div>
            </Fields>
          </InfoCard>
        ))}
      </InfoCards>

    </Module>
  )
}
