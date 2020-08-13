/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { css } from "emotion"
import styled from "@emotion/styled"
import React from "react"

import { NavLink } from "./links"

import logo from "../assets/logo.png"
import { ReactComponent as OpenSidebarIcon } from "../assets/open-pane.svg"
import { ReactComponent as CloseSidebarIcon } from "../assets/close-pane.svg"

import { colors, fontRegular } from "../styles/variables"
import { useUiState } from "../hooks"
import { Page } from "../contexts/api"

interface Props {
  pages: Page[]
}

const Button = styled.li`
  ${fontRegular};
  border-radius: 2px;
  cursor: pointer;
  width: 100%;
  transition: all 0.3s ease;
  &:hover {
    background-color: ${colors.gardenGreenLight};
    border-color: ${colors.gardenGreenLight};
  }
`

const linkStyle = `
  display: inline-block;
  font-size: 1rem;
  margin-left: 1.5rem;
  padding: 0.5em 0.5em 0.5em 0;
  width: 100%;
`

const A = styled.a(linkStyle)
const Link = styled(NavLink)(linkStyle)

// Style and align properly
const Logo = styled.img`
  width: 144px;
  height: 60px;
  max-width: 9rem;
`

type SidebarContainerProps = {
  visible: boolean
}
const SidebarContainer = styled.div<SidebarContainerProps>`
  display: ${(props) => (props.visible ? `block` : "none")};
  width: ${(props) => (props.visible ? `11.5rem` : "0")};
`

const SidebarToggleButton = styled.div`
  position: absolute;
  left: 1.5rem;
  bottom: 1.5rem;
  width: 1.5rem;
  cursor: pointer;
  font-size: 1.125rem;
`

const Sidebar: React.FC<Props> = ({ pages }) => {
  const {
    state: { isSidebarOpen },
    actions: { toggleSidebar },
  } = useUiState()

  return (
    <>
      <SidebarToggleButton onClick={toggleSidebar}>
        {isSidebarOpen ? <CloseSidebarIcon /> : <OpenSidebarIcon />}
      </SidebarToggleButton>
      <SidebarContainer visible={isSidebarOpen}>
        <div className={"ml-1"}>
          <NavLink to="/">
            <Logo src={logo} alt="Home" />
          </NavLink>
        </div>
        <div className="pb-1">
          <nav>
            <ul className="pt-1">
              {pages.map((page) => (
                <SidebarButton key={page.path} page={page} />
              ))}
            </ul>
          </nav>
        </div>
      </SidebarContainer>
    </>
  )
}

interface SidebarButtonProps {
  page: Page
}

const SidebarButton: React.FC<SidebarButtonProps> = ({ page }) => {
  let link: React.ReactNode
  if (page.newWindow && page.url) {
    link = (
      <A href={page.url} target="_blank" title={page.description}>
        {page.title}
        <i className={`${css("color: #ccc; margin-left: 0.5em;")} fas fa-external-link-alt`} />
      </A>
    )
  } else {
    link = (
      <Link exact to={{ pathname: page.path, state: page }} title={page.description}>
        {page.title}
      </Link>
    )
  }
  return <Button key={page.title}>{link}</Button>
}

export default Sidebar
