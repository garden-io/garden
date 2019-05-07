/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { ServiceModel, ModuleModel } from "../containers/overview"
import Service from "./service"

const Module = styled.div`
  padding: 0rem 2rem 1rem 0rem;
`

const Services = styled.div`
  border-top: solid #bcbcbc 1px;
  padding-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: middle;
`
const Header = styled.div`
  display: flex;
  align-items: center;
`

const Label = styled.div`
  font-size: .75rem;
  display: flex;
  align-items: center;
  color: #bcbcbc;
`
const Name = styled.div`
  padding-right: .5rem;
`

interface ModuleProp {
  module: ModuleModel
}
export default ({
  module: { services = [], name },
}: ModuleProp) => {

  return (
    <Module key={name}>
      <Header>
        <Name>{name}</Name>
        <Label>MODULE</Label>

      </Header>
      <Services>
        {services.map(service => (
          <Service key={service.name} service={service as ServiceModel} />
        ))}
      </Services>
    </Module>
  )
}
