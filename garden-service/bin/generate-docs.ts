#!/usr/bin/env ts-node

import { generateDocs } from "../src/docs/generate"
import { resolve } from "path"

generateDocs(resolve(__dirname, "..", "..", "docs"))
