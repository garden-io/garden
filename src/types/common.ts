import * as Joi from "joi"

export type SimpleLiteral = string | number | boolean

export const JoiLiteral = () => Joi.alternatives().try(Joi.number(), Joi.string(), Joi.boolean())

export const identifierRegex = /^[a-z0-9][\w\d\-]*$/i

export const JoiIdentifier = () => Joi
  .string().regex(identifierRegex)
  .description("may contain letters, numbers, underscores and dashes and must start with a letter or number")
