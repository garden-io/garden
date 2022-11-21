import { readFileSync } from "fs-extra"
import { post } from "request"

const testResultsData = readFileSync("report.tmp").toString()

const testPassed = testResultsData.match(/\ncore ┄┄┄┄┄    (\d+) passing/)
const testFailed = testResultsData.match(/\ncore ┄┄┄┄┄    (\d+) failing/)

if (!testFailed || !testFailed[1] || !testPassed || !testPassed[1]) throw "Failed to read test results"

const prUrl = process.env.CIRCLE_PULL_REQUEST
const branch = process.env.CIRCLE_BRANCH
const ciJobUrl = process.env.CIRCLE_BUILD_URL

const formattedPrUrl = prUrl ? `\n${prUrl}` : ""
const formattedBranch = `<https://github.com/garden-io/garden/tree/${branch}|${branch}>`
const formattedJob = `<${ciJobUrl}|ci job>`

const report = `Unit tests passing ${testPassed[1]}/${parseInt(testFailed[1])+parseInt(testPassed[1])}
${formattedJob} | branch: ${formattedBranch}${formattedPrUrl}`

const webhookUrl = branch === "0.13" ? process.env.GRAPH_V2_SLACK_WH : process.env.GRAPH_V2_PR_SLACK_WH

if (!webhookUrl) throw "webhook URL undefined"

post(
  webhookUrl,
  {
    body: JSON.stringify({ text: report }),
    headers: { "Content-type": "application/json" },
  },
  (err) => {
    if (err) throw err

    console.log("reported to slack; \n", report)
  }
)
