const { join } = require("path")
const { ensureDir, ensureFile } = require("fs-extra")

let levels = 6
let directoriesPerLevel = 6
let filesPerLevel = 3

async function generateData(cwd, level) {
  level++

  let files = 0
  let directories = 0

  for (let d = 0; d < directoriesPerLevel; d++) {
    const dir = join(cwd, "dir" + d)
    await ensureDir(dir)
    directories++

    for (let f = 0; f < filesPerLevel; f++) {
      const file = join(dir, "file" + f)
      await ensureFile(file)
      files++
    }

    if (level < levels) {
      const res = await generateData(dir, level)
      files += res.files
      directories += res.directories
    }
  }

  return { files, directories }
}

generateData(process.cwd(), 0)
  .then((res) => {
    console.log(`Made ${res.files} files in ${res.directories} directories`)
  })
  .catch(err => {
    console.log(err)
    process.exit(1)
  })
