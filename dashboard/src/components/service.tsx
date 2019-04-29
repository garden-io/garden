/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import { css } from "emotion"
import styled from "@emotion/styled"
import { ReactComponent as VIcon } from "./../assets/v.svg"
import Ingresses from "./ingresses"
import { ServiceModel } from "../containers/overview"
import { ServiceState } from "garden-cli/src/types/service"
import { colors } from "../styles/variables"
import { Facebook } from "react-content-loader"

const Service = styled.div`
  width: 17rem;
  height: 13rem;
  background-color: white;
  margin-bottom: 1rem;
  box-shadow: 0px 1px 5px rgba(0, 0, 0, .2),
    0px 3px 4px rgba(255, 255, 255, .12), 0px 2px 4px rgb(255, 255, 255);
  margin-right: 1rem;
  &:last-of-type {
    margin-right: 0;
  }
`
const Header = styled.div`
  width: 100%;
  padding: .4rem .75rem;
  border-bottom: 1px solid #c4c4c4;
  height: 3rem;
`

const Fields = styled.div`
 animation: fadein .75s;

  @keyframes fadein {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`
const Field = styled.div`
  padding-bottom: .5rem;
`
const Label = styled.div`
  font-size: .75rem;
  line-height: 1rem;
  color: #878787;
`
const Value = styled.div`
  font-size: 1rem;
  line-height: 1.4rem;
  color: #4f4f4f;
`

const Content = styled.div`
  width: 100%;
  padding: .75rem .75rem .75rem .75rem;
  position: relative;
  height: 10rem;
`

type StateProps = {
  state?: ServiceState,
}
const State = styled.div<StateProps>`
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 2rem;
  margin-left: auto;
  background-color: ${props => (props && props.state && colors.status[props.state] || colors.gardenGrayLight)};
  display: flex;
  align-items: center;
`

const Tag = styled.div`
  font-size: .56rem;
  display: flex;
  align-items: center;
  color: #bcbcbc;
`
const Name = styled.div`
  height: 1.5rem;
  font-size: 1.25rem;
  color: rgba(0, 0, 0, .87);
`

const Row = styled.div`
  display: flex;
  align-items: center;
`

interface ServiceProp {
  service: ServiceModel
}
export default ({
  service: { name, ingresses, state, isLoading },
}: ServiceProp) => {

  return (
    <Service>
      <Header>
        <Tag>SERVICE</Tag>
        <Row>
          <Name>{name}</Name>
          <State state={state}>
            <VIcon className={`${css("margin: 0 auto;")}`} />
          </State>
        </Row>
      </Header>
      <Content>
        {isLoading && (
          <Facebook height={300} />
        )}
        {!isLoading && (
          <Fields>
            <Field>
              <Label>State</Label>
              <Value>{state}</Value>
            </Field>
            <Field>
              <Label>Ingresses</Label>
              <Ingresses ingresses={ingresses} />
            </Field>
          </Fields>
        )}
      </Content>

    </Service>
  )
}
