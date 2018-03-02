import * as Joi from "joi"
import { EnvironmentConfig } from "./project-config"

export type Primitive = string | number | boolean

export interface PrimitiveMap { [key: string]: Primitive }

export const joiPrimitive = () => Joi.alternatives().try(Joi.number(), Joi.string(), Joi.boolean())

export const identifierRegex = /^[a-z][a-z0-9\-]*$/

export const joiIdentifier = () => Joi
  .string().regex(identifierRegex)
  .description("may contain lowercase letters, numbers and dashes and must start with a letter")

export const joiVariables = () => Joi
  .object().pattern(/[\w\d]+/i, joiPrimitive())
  .default(() => ({}), "{}")

export interface Environment {
  name: string
  namespace: string
  config: EnvironmentConfig,
}

export function isPrimitive(value: any) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}
