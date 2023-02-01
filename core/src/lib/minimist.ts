/**
 * Forked and adapted from https://github.com/substack/minimist/blob/aeb3e27dae0412de5c0494e9563a5f10c82cc7a9/index.js
 *
 * Needed to extract unhandled options (added the _unknown output field).
 */

export function customMinimist(args, opts: minimist.Opts): minimist.ParsedArgs {
  if (!opts) {
    opts = {}
  }

  let flags = {
    bools: <{ [key: string]: boolean }>{},
    strings: <{ [key: string]: boolean }>{},
    unknownFn: <minimist.Opts["unknown"] | null>null,
    allBools: false,
  }

  if (typeof opts["unknown"] === "function") {
    flags.unknownFn = opts["unknown"]
  }

  if (typeof opts["boolean"] === "boolean" && opts["boolean"]) {
    flags.allBools = true
  } else {
    const booleans = typeof opts.boolean === "string" ? [opts.boolean] : opts.boolean || []

    for (const key of booleans.filter(Boolean)) {
      flags.bools[key] = true
    }
  }

  let aliases = {}
  Object.keys(opts.alias || {}).forEach(function (key) {
    aliases[key] = typeof opts.alias?.[key] === "string" ? [opts.alias[key]] : opts.alias?.[key] || []
    aliases[key].forEach(function (x) {
      aliases[x] = [key].concat(
        aliases[key].filter(function (y) {
          return x !== y
        })
      )
    })
  })

  const strings = typeof opts.string === "string" ? [opts.string] : opts.string || []

  for (const key of strings.filter(Boolean)) {
    flags.strings[key] = true
    if (aliases[key]) {
      flags.strings[aliases[key]] = true
    }
  }

  let defaults = opts["default"] || {}

  let argv = { _: <string[]>[], _unknown: <string[]>[] }
  Object.keys(flags.bools).forEach(function (key) {
    setArg(key, defaults[key] === undefined ? false : defaults[key])
  })

  let notFlags = []

  if (args.indexOf("--") !== -1) {
    notFlags = args.slice(args.indexOf("--") + 1)
    args = args.slice(0, args.indexOf("--"))
  }

  function argDefined(key, arg) {
    return (flags.allBools && /^--[^=]+$/.test(arg)) || flags.strings[key] || flags.bools[key] || aliases[key]
  }

  function setArg(key, val, arg?: string) {
    if (arg && !argDefined(key, arg)) {
      if (flags.unknownFn && flags.unknownFn(arg) === false) {
        return
      }
    }

    let value = !flags.strings[key] && isNumber(val) ? Number(val) : val
    setKey(argv, key.split("."), value)

    for (const x of aliases[key] || []) {
      setKey(argv, x.split("."), value)
    }
  }

  function setKey(obj, keys, value) {
    let o = obj
    for (let i = 0; i < keys.length - 1; i++) {
      // eslint-disable-next-line no-shadow,@typescript-eslint/no-shadow
      let key = keys[i]
      if (key === "__proto__") {
        return
      }
      if (o[key] === undefined) {
        o[key] = {}
      }
      if (o[key] === Object.prototype || o[key] === Number.prototype || o[key] === String.prototype) {
        o[key] = {}
      }
      if (o[key] === Array.prototype) {
        o[key] = []
      }
      o = o[key]
    }

    let key = keys[keys.length - 1]
    if (key === "__proto__") {
      return
    }
    if (o === Object.prototype || o === Number.prototype || o === String.prototype) {
      o = {}
    }
    if (o === Array.prototype) {
      o = []
    }
    if (o[key] === undefined || flags.bools[key] || typeof o[key] === "boolean") {
      o[key] = value
    } else if (Array.isArray(o[key])) {
      o[key].push(value)
    } else {
      o[key] = [o[key], value]
    }
  }

  function aliasIsBoolean(key) {
    return aliases[key].some(function (x) {
      return flags.bools[x]
    })
  }

  for (let i = 0; i < args.length; i++) {
    let arg = args[i]

    if (/^--.+=/.test(arg)) {
      // Using [\s\S] instead of . because js doesn't support the
      // 'dotall' regex modifier. See:
      // http://stackoverflow.com/a/1068308/13216
      let m = arg.match(/^--([^=]+)=([\s\S]*)$/)
      let key = m[1]
      let value = m[2]
      if (flags.bools[key]) {
        value = value !== "false"
      }
      if (!argDefined(key, arg)) {
        argv._unknown.push(arg)
      }
      setArg(key, value, arg)
    } else if (/^--no-.+/.test(arg)) {
      let key = arg.match(/^--no-(.+)/)[1]
      if (!argDefined(key, arg)) {
        argv._unknown.push(arg)
      }
      setArg(key, false, arg)
    } else if (/^--.+/.test(arg)) {
      let key = arg.match(/^--(.+)/)[1]
      let next = args[i + 1]
      if (
        next !== undefined &&
        !/^-/.test(next) &&
        !flags.bools[key] &&
        !flags.allBools &&
        (aliases[key] ? !aliasIsBoolean(key) : true)
      ) {
        if (!argDefined(key, arg)) {
          argv._unknown.push(arg, next)
        }
        setArg(key, next, arg)
        i++
      } else if (/^(true|false)$/.test(next)) {
        if (!argDefined(key, arg)) {
          argv._unknown.push(arg, next)
        }
        setArg(key, next === "true", arg)
        i++
      } else {
        if (!argDefined(key, arg)) {
          argv._unknown.push(arg)
        }
        setArg(key, flags.strings[key] ? "" : true, arg)
      }
    } else if (/^-[^-]+/.test(arg)) {
      let letters = arg.slice(1, -1).split("")

      let broken = false
      for (let j = 0; j < letters.length; j++) {
        let next = arg.slice(j + 2)

        if (next === "-") {
          setArg(letters[j], next, arg)
          continue
        }

        if (/[A-Za-z]/.test(letters[j]) && /=/.test(next)) {
          setArg(letters[j], next.split("=")[1], arg)
          broken = true
          break
        }

        if (/[A-Za-z]/.test(letters[j]) && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
          setArg(letters[j], next, arg)
          broken = true
          break
        }

        if (letters[j + 1] && letters[j + 1].match(/\W/)) {
          setArg(letters[j], arg.slice(j + 2), arg)
          broken = true
          break
        } else {
          setArg(letters[j], flags.strings[letters[j]] ? "" : true, arg)
        }
      }

      let key = arg.slice(-1)[0]
      if (!broken && key !== "-") {
        if (
          args[i + 1] &&
          !/^(-|--)[^-]/.test(args[i + 1]) &&
          !flags.bools[key] &&
          (aliases[key] ? !aliasIsBoolean(key) : true)
        ) {
          if (!argDefined(key, arg)) {
            argv._unknown.push(arg, args[i + 1])
          }
          setArg(key, args[i + 1], arg)
          i++
        } else if (args[i + 1] && /^(true|false)$/.test(args[i + 1])) {
          if (!argDefined(key, arg)) {
            argv._unknown.push(arg, args[i + 1])
          }
          setArg(key, args[i + 1] === "true", arg)
          i++
        } else {
          if (!argDefined(key, arg)) {
            argv._unknown.push(arg)
          }
          setArg(key, flags.strings[key] ? "" : true, arg)
        }
      }
    } else {
      if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
        const v = flags.strings["_"] || !isNumber(arg) ? arg : Number(arg)
        argv._.push(v)
        argv._unknown.push(v)
      }
      if (opts.stopEarly) {
        argv._.push.apply(argv._, args.slice(i + 1))
        argv._unknown.push.apply(argv._unknown, args.slice(i + 1))
        break
      }
    }
  }

  Object.keys(defaults).forEach(function (key) {
    if (!hasKey(argv, key.split("."))) {
      setKey(argv, key.split("."), defaults[key])
      for (const x of aliases[key] || []) {
        setKey(argv, x.split("."), defaults[key])
      }
    }
  })

  argv._unknown.push(...notFlags)

  if (opts["--"]) {
    argv["--"] = new Array()
    notFlags.forEach(function (key) {
      argv["--"].push(key)
    })
  } else {
    notFlags.forEach(function (key) {
      argv._.push(key)
    })
  }

  return argv
}

function hasKey(obj, keys) {
  let o = obj
  keys.slice(0, -1).forEach(function (k) {
    o = o[k] || {}
  })

  let key = keys[keys.length - 1]
  return key in o
}

function isNumber(x) {
  if (typeof x === "number") {
    return true
  }
  if (/^0x[0-9a-f]+$/i.test(x)) {
    return true
  }
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x)
}

// Type definitions for minimist 1.2
// Project: https://github.com/substack/minimist
// Definitions by: Bart van der Schoor <https://github.com/Bartvds>
//                 Necroskillz <https://github.com/Necroskillz>
//                 kamranayub <https://github.com/kamranayub>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/**
 * Return an argument object populated with the array arguments from args
 *
 * @param [args] An optional argument array (typically `process.argv.slice(2)`)
 * @param [opts] An optional options object to customize the parsing
 */
declare function minimist(args?: string[], opts?: minimist.Opts): minimist.ParsedArgs

/**
 * Return an argument object populated with the array arguments from args. Strongly-typed
 * to be the intersect of type T with minimist.ParsedArgs.
 *
 * `T` The type that will be intersected with minimist.ParsedArgs to represent the argument object
 *
 * @param [args] An optional argument array (typically `process.argv.slice(2)`)
 * @param [opts] An optional options object to customize the parsing
 */
declare function minimist<T>(args?: string[], opts?: minimist.Opts): T & minimist.ParsedArgs

/**
 * Return an argument object populated with the array arguments from args. Strongly-typed
 * to be the the type T which should extend minimist.ParsedArgs
 *
 * `T` The type that extends minimist.ParsedArgs and represents the argument object
 *
 * @param [args] An optional argument array (typically `process.argv.slice(2)`)
 * @param [opts] An optional options object to customize the parsing
 */
declare function minimist<T extends minimist.ParsedArgs>(args?: string[], opts?: minimist.Opts): T

declare namespace minimist {
  interface Opts {
    /**
     * A string or array of strings argument names to always treat as strings
     */
    "string"?: string | string[] | undefined

    /**
     * A boolean, string or array of strings to always treat as booleans. If true will treat
     * all double hyphenated arguments without equals signs as boolean (e.g. affects `--foo`, not `-f` or `--foo=bar`)
     */
    "boolean"?: boolean | string | string[] | undefined

    /**
     * An object mapping string names to strings or arrays of string argument names to use as aliases
     */
    "alias"?: { [key: string]: string | string[] } | undefined

    /**
     * An object mapping string argument names to default values
     */
    "default"?: { [key: string]: any } | undefined

    /**
     * When true, populate argv._ with everything after the first non-option
     */
    "stopEarly"?: boolean | undefined

    /**
     * A function which is invoked with a command line parameter not defined in the opts
     * configuration object. If the function returns false, the unknown option is not added to argv
     */
    "unknown"?: ((arg: string) => boolean) | undefined

    /**
     * When true, populate argv._ with everything before the -- and argv['--'] with everything after the --.
     * Note that with -- set, parsing for arguments still stops after the `--`.
     */
    "--"?: boolean | undefined
  }

  interface ParsedArgs {
    [arg: string]: any

    /**
     * If opts['--'] is true, populated with everything after the --
     */
    "--"?: string[] | undefined

    /**
     * Contains all the arguments that didn't have an option associated with them
     */
    "_": string[]
  }
}

