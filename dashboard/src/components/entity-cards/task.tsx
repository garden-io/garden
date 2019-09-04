/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import moment from "moment"
import { Facebook as ContentLoader } from "react-content-loader"
import { FieldWrap, Field, Key, Value, FieldGroup } from "./common"
import { getDuration } from "../../util/helpers"
import { TertiaryButton } from "../button"
import { css } from "emotion"
import { SelectEntity } from "../../contexts/ui"
import { Test, Task } from "../../contexts/api"
import { EntityCardWrap, Header, Label, Name, StateLabel, Content } from "./common"

export type Props = Pick<Task["config"], "name" | "dependencies"> &
  Pick<Test["status"], "state" | "startedAt" | "completedAt"> & {
    moduleName: string
    isLoading: boolean
    showInfo: boolean
    onEntitySelected: SelectEntity
  }

// FIXME: Use a single card for Test and Task, they're basically the same.
export const TaskCard = ({
  name,
  dependencies,
  state,
  startedAt,
  completedAt,
  moduleName,
  isLoading,
  showInfo,
  onEntitySelected,
}: Props) => {
  const duration = startedAt && completedAt && getDuration(startedAt, completedAt)

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
    <EntityCardWrap>
      <Header>
        <div>
          <Label>TASK</Label>
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
            <FieldGroup className="row between-xs middle-xs" visible={!!startedAt}>
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
                    margin-top: 0.5rem;
                  `}
                >
                  Show result
                </TertiaryButton>
              </div>
            </div>
          </FieldWrap>
        )}
      </Content>
    </EntityCardWrap>
  )
}
