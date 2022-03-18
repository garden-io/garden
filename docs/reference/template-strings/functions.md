---
order: 0
title: Template Helper Functions
---

# Template Helper Functions

These are all the helper functions available in template strings, and some usage examples for each.

## base64Decode

Decodes the given base64-encoded string.

Usage: `base64Decode(string)`

Examples:

* `${base64Decode("bXkgdmFsdWU=")}` -> `"my value"`

## base64Encode

Encodes the given string as base64.

Usage: `base64Encode(string)`

Examples:

* `${base64Encode("my value")}` -> `"bXkgdmFsdWU="`

## camelCase

Converts the given string to a valid camelCase identifier, changing the casing and removing characters as necessary.

Usage: `camelCase(string)`

Examples:

* `${camelCase("Foo Bar")}` -> `"fooBar"`
* `${camelCase("--foo-bar--")}` -> `"fooBar"`
* `${camelCase("__FOO_BAR__")}` -> `"fooBar"`

## indent

Indents each line in the given string with the specified number of spaces.

Usage: `indent(string, spaces)`

Examples:

* `${indent("some: multiline\nyaml: document", 2)}` -> `"  some: multiline\n  yaml: document"`
* `${indent("My\nblock\nof\ntext", 4)}` -> `"    My\n    block\n    of\n    text"`

## isEmpty

Returns true if the given value is an empty string, object, array, null or undefined.

Usage: `isEmpty([value])`

Examples:

* `${isEmpty({})}` -> `true`
* `${isEmpty({"not":"empty"})}` -> `false`
* `${isEmpty([])}` -> `true`
* `${isEmpty([1,2,3])}` -> `false`
* `${isEmpty("")}` -> `true`
* `${isEmpty("not empty")}` -> `false`
* `${isEmpty(null)}` -> `true`

## join

Takes an array of strings (or other primitives) and concatenates them into a string, with the given separator

Usage: `join(input, separator)`

Examples:

* `${join(["some","list","of","strings"], " ")}` -> `"some list of strings"`
* `${join(["some","list","of","strings"], ".")}` -> `"some.list.of.strings"`

## jsonDecode

Decodes the given JSON-encoded string.

Usage: `jsonDecode(string)`

Examples:

* `${jsonDecode("{\"foo\": \"bar\"}")}` -> `{"foo":"bar"}`
* `${jsonDecode("\"JSON encoded string\"")}` -> `"JSON encoded string"`
* `${jsonDecode("[\"my\", \"json\", \"array\"]")}` -> `["my","json","array"]`

## jsonEncode

Encodes the given value as JSON.

Usage: `jsonEncode(value)`

Examples:

* `${jsonEncode(["some","array"])}` -> `"[\"some\",\"array\"]"`
* `${jsonEncode({"some":"object"})}` -> `"{\"some\":\"object\"}"`

## kebabCase

Converts the given string to a valid kebab-case identifier, changing to all lowercase and removing characters as necessary.

Usage: `kebabCase(string)`

Examples:

* `${kebabCase("Foo Bar")}` -> `"foo-bar"`
* `${kebabCase("fooBar")}` -> `"foo-bar"`
* `${kebabCase("__FOO_BAR__")}` -> `"foo-bar"`

## lower

Convert the given string to all lowercase.

Usage: `lower(string)`

Examples:

* `${lower("Some String")}` -> `"some string"`

## replace

Replaces all occurrences of a given substring in a string.

Usage: `replace(string, substring, replacement)`

Examples:

* `${replace("string_with_underscores", "_", "-")}` -> `"string-with-underscores"`
* `${replace("remove.these.dots", ".", "")}` -> `"removethesedots"`

## sha256

Creates a SHA256 hash of the provided string.

Usage: `sha256(string)`

Examples:

* `${sha256("Some String")}` -> `"7f0fd64653ba0bb1a579ced2b6bf375e916cc60662109ee0c0b24f0a750c3a6c"`

## slice

Slices a string or array at the specified start/end offsets. Note that you can use a negative number for the end offset to count backwards from the end.

Usage: `slice(input, start, [end])`

Examples:

* `${slice("ThisIsALongStringThatINeedAPartOf", 11, -7)}` -> `"StringThatINeed"`
* `${slice(".foo", 1)}` -> `"foo"`

## split

Splits the given string by a substring (e.g. a comma, colon etc.).

Usage: `split(string, separator)`

Examples:

* `${split("a,b,c", ",")}` -> `["a","b","c"]`
* `${split("1:2:3:4", ":")}` -> `["1","2","3","4"]`

## string

Converts the given value to a string.

Usage: `string(value)`

Examples:

* `${string(1)}` -> `"1"`
* `${string(true)}` -> `"true"`

## trim

Trims whitespace (or other specified characters) off the ends of the given string.

Usage: `trim(string, [characters])`

Examples:

* `${trim("   some string with surrounding whitespace ")}` -> `"some string with surrounding whitespace"`

## upper

Converts the given string to all uppercase.

Usage: `upper(string)`

Examples:

* `${upper("Some String")}` -> `"SOME STRING"`

## uuidv4

Generates a random v4 UUID.

Usage: `uuidv4()`

Examples:

* `${uuidv4()}` -> `"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"`

## yamlDecode

Decodes the given YAML-encoded string. Note that for multi-document YAML strings, you need to set the 2nd argument to true (see below).

Usage: `yamlDecode(string, [multiDocument])`

Examples:

* `${yamlDecode("a: 1\nb: 2\n")}` -> `{"a":1,"b":2}`
* `${yamlDecode("a: 1\nb: 2\n---\na: 3\nb: 4\n", true)}` -> `[{"a":1,"b":2},{"a":3,"b":4}]`

## yamlEncode

Encodes the given value as YAML.

Usage: `yamlEncode(value, [multiDocument])`

Examples:

* `${yamlEncode({"my":"simple document"})}` -> `"my: simple document\n"`
* `${yamlEncode([{"a":1,"b":2},{"a":3,"b":4}], true)}` -> `"---a: 1\nb: 2\n---a: 3\nb: 4\n"`

