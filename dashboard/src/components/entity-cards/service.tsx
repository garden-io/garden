/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import { Facebook as ContentLoader } from "react-content-loader"
import { FieldWrap, Field, Key, Value } from "./common"
import Ingresses from "../ingresses"
import { EntityCardWrap, Header, Content, Name, StateLabel, Label } from "./common"
import { Service } from "../../contexts/api"

export type Props = Pick<Service["config"], "name" | "dependencies"> &
  Pick<Service["status"], "ingresses" | "state"> & {
    isLoading: boolean
    showInfo: boolean
  }

export const ServiceCard = ({ name, dependencies, state, ingresses, isLoading, showInfo }: Props) => {
  return (
    <EntityCardWrap>
      <Header>
        <div>
          <Label>SERVICE</Label>
          <Name>{name}</Name>
        </div>
        {state && <StateLabel state={state}>{state}</StateLabel>}
      </Header>
      <Content>
        {isLoading && <ContentLoader height={100} />}
        {!isLoading && (
          <FieldWrap visible={showInfo}>
            <Field inline visible={dependencies.length > 0}>
              <Key>Depends on:</Key>
              <Value>{dependencies.join(", ")}</Value>
            </Field>
            <Field visible={!!ingresses && ingresses.length > 0}>
              <Ingresses ingresses={ingresses} />
            </Field>
          </FieldWrap>
        )}
      </Content>
    </EntityCardWrap>
  )
}
