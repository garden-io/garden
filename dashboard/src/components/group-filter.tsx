/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { colors } from "../styles/variables"

interface FilterProps {
  selected: boolean
}

const Filter = styled.li<FilterProps>`
  padding: 0.5rem;
  border: 1px solid transparent;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 19px;
  display: flex;
  align-items: center;
  text-align: center;
  letter-spacing: 0.01em;
  color: ${(props) => (props.selected ? "white" : colors.grayUnselected)};
  background-color: ${(props) => (props.selected ? colors.gardenGreenDark : "white")};
  box-shadow: 0px 6px 18px rgba(0, 0, 0, 0.06);
  margin-right: 0.25rem;
  border-radius: 4px;
  height: 2rem;
  transition: background-color 0.2s ease-in-out;

  &:hover {
    cursor: pointer;
    background-color: ${(props) => (!props.selected ? "white" : colors.gardenPink)};
  }
`

const Filters = styled.ul`
  display: flex;
`
const FilterGroup = styled.ul`
  display: flex;
`
export type Filters<T extends string> = {
  [key in T]: {
    label: string
    selected: boolean
    readonly?: boolean
  }
}

interface GroupedFiltersButtonProps<T extends string> {
  onFilter: (key: T) => void
  groups: Filters<T>[]
}

export class GroupedFiltersButton<T extends string> extends React.Component<GroupedFiltersButtonProps<T>> {
  constructor(props) {
    super(props)
    this.handleFilter = this.handleFilter.bind(this)
  }

  handleFilter(event): void {
    this.props.onFilter(event.target.id)
  }

  render() {
    return (
      <Filters>
        {this.props.groups.map((group, index) => (
          <FilterGroup key={index}>
            {group &&
              Object.keys(group).map((filterKey) => (
                <Filter id={filterKey} selected={group[filterKey].selected} onClick={this.handleFilter} key={filterKey}>
                  {group[filterKey].label}
                </Filter>
              ))}
          </FilterGroup>
        ))}
      </Filters>
    )
  }
}

interface FiltersButtonProps<T extends string> {
  onFilter: (key: T) => void
  filters: Filters<T>
}

export class FiltersButton<T extends string> extends React.Component<FiltersButtonProps<T>> {
  constructor(props) {
    super(props)
    this.handleFilter = this.handleFilter.bind(this)
  }

  handleFilter(event): void {
    this.props.onFilter(event.target.id)
  }

  render() {
    const filters = this.props.filters
    return (
      <Filters>
        {filters &&
          Object.keys(filters).map((filterKey) => (
            <Filter id={filterKey} selected={filters[filterKey].selected} onClick={this.handleFilter} key={filterKey}>
              {filters[filterKey].label}
            </Filter>
          ))}
      </Filters>
    )
  }
}
