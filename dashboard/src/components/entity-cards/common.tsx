/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import { colors } from "../../styles/variables"

export const EntityCardWrap = styled.div`
  max-height: 13rem;
  background-color: white;
  margin-right: 1rem;
  box-shadow: 2px 2px 9px rgba(0, 0, 0, 0.14);
  border-radius: 4px;
  width: 100%;
  margin-top: 1rem;
  padding: 0.75rem;

  &:first-of-type {
    margin-top: 0;
  }

  &:last-of-type {
    margin-right: 0;
  }
`

export const Header = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
`

export const Content = styled.div`
  width: 100%;
  position: relative;
  max-height: 10rem;
  padding-top: 0.75rem;
  &:empty {
    display: none;
  }
`

type StateLabelProps = {
  state: string
}

export const StateLabel = styled.div<StateLabelProps>`
  padding: 0 0.5rem;
  margin-left: auto;
  background-color: ${(props) => (props && props.state ? colors.state[props.state] : colors.gardenGrayLight)};
  display: ${(props) => (props && props.state && colors.state[props.state] ? "flex" : "none")};
  align-items: center;
  border-radius: 0.25rem;
  font-weight: 500;
  font-size: 0.6875rem;
  line-height: 1rem;
  text-align: center;
  letter-spacing: 0.02em;
  color: #ffffff;
  height: 1rem;
`

export const Label = styled.div`
  display: flex;
  align-items: center;
  font-weight: 500;
  font-size: 10px;
  line-height: 10px;
  text-align: right;
  letter-spacing: 0.01em;
  color: #90a0b7;
`

export const Name = styled.div`
  font-size: 0.9375rem;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.87);
  padding-top: 0.125rem;
`

type FieldWrapProps = {
  visible: boolean
}

export const FieldWrap = styled.div<FieldWrapProps>`
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

type FieldProps = {
  inline?: boolean
  visible: boolean
}

export const Field = styled.div<FieldProps>`
  display: ${(props) => (props.visible ? (props.inline ? "flex" : "block") : "none")};
  flex-direction: row;
`

type FieldGroupProps = {
  visible: boolean
}

export const FieldGroup = styled.div<FieldGroupProps>`
  display: ${(props) => (props.visible ? "flex" : "none")};
  flex-direction: row;
  padding-top: 0.25rem;
`

export const Key = styled.div`
  padding-right: 0.25rem;
  font-size: 0.8125rem;
  line-height: 1.1875rem;
  letter-spacing: 0.01em;
  color: #4c5862;
  opacity: 0.5;
`

export const Value = styled.div`
  padding-right: 0.5rem;
  font-size: 0.8125rem;
  line-height: 1.1875rem;
  letter-spacing: 0.01em;
`
