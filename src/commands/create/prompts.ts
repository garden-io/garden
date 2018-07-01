/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as inquirer from "inquirer"
import * as Joi from "joi"
import chalk from "chalk"

import { joiIdentifier } from "../../types/common"
import { ModuleType } from "./config-templates"

export interface ModuleTypeChoice extends inquirer.objects.ChoiceOption {
  value: ModuleType
}

export interface ModuleTypeMap {
  type: ModuleType
}

export interface ModuleTypeAndName extends ModuleTypeMap {
  name: string
}

export interface Prompts {
  addConfigForModule: (...args: any[]) => Promise<ModuleTypeMap>
  addModule: (...args: any[]) => Promise<ModuleTypeAndName>
  repeatAddModule: (...args: any[]) => Promise<ModuleTypeAndName[]>
}

const moduleTypeChoices: ModuleTypeChoice[] = [
  {
    name: "container",
    value: "container",
  },
  {
    name: `google-cloud-function (${chalk.red.italic("experimental")})`,
    value: "function",
  },
  {
    name: `npm package (${chalk.red.italic("experimental")})`,
    value: "npm-package",
  },
]

// Create config for an existing module
async function addConfigForModule(dir: string): Promise<ModuleTypeMap> {
  const qNames = {
    ADD_MODULE: "addModule",
    TYPE: "type",
  }
  const questions: inquirer.Questions = [
    {
      name: qNames.ADD_MODULE,
      message: `Add module config for ${chalk.italic(dir)}?`,
      type: "confirm",
    },
    {
      name: qNames.TYPE,
      message: "Module type",
      choices: moduleTypeChoices,
      when: ans => ans[qNames.ADD_MODULE],
      type: "list",
    },
  ]
  return await inquirer.prompt(questions) as ModuleTypeMap
}

// Create a new module with config
async function addModule(addModuleMessage: string): Promise<ModuleTypeAndName> {
  const qNames = {
    ADD_MODULE: "addModule",
    NAME: "name",
    TYPE: "type",
  }
  const questions: inquirer.Questions = [
    {
      name: qNames.ADD_MODULE,
      message: addModuleMessage,
      type: "confirm",
    },
    {
      name: qNames.NAME,
      message: "Enter module name",
      type: "input",
      validate: input => {
        try {
          Joi.attempt(input.trim(), joiIdentifier())
        } catch (err) {
          return `Invalid module name, please try again\nError: ${err.message}`
        }
        return true
      },
      filter: input => input.trim(),
      when: ans => ans[qNames.ADD_MODULE],
    },
    {
      name: qNames.TYPE,
      message: "Module type",
      choices: moduleTypeChoices,
      when: ans => ans[qNames.NAME],
      type: "list",
    },
  ]
  return await inquirer.prompt(questions) as ModuleTypeAndName
}

async function repeatAddModule(addedModules: string[] = []): Promise<ModuleTypeAndName[]> {
  let addModuleMessage
  let modules: ModuleTypeAndName[] = []
  if (addedModules.length < 1) {
    addModuleMessage = "Would you like to add a module to your project?"
  } else {
    addModuleMessage = `Add another module? (current modules: ${addedModules.join(", ")})`
  }
  const { name, type } = await addModule(addModuleMessage)

  if (type) {
    modules.push({ name, type })
    await repeatAddModule(addedModules.concat(name))
  }
  return modules
}

export const prompts: Prompts = {
  addConfigForModule,
  addModule,
  repeatAddModule,
}
