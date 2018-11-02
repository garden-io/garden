package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/garden-io/garden/garden-cli/dockerutil"
	"github.com/garden-io/garden/garden-cli/util"
)

// A CLI for running Garden commands in a garden-service container.
//
// For a new project the flow is as follows:
//
// 	1. Create a named garden-sync volume for the project
// 	2.1 Create and start a garden-sync container, mount the named volume and bind
// 	mount the project directory
// 	2.2 Sync the contents of the mounted project directory into the named volume
// 	2.3 Start a process inside the sync-container that watches for changes to the mounted project directory and
// 	syncs with the volume
// 	3.1 Start a garden-service container and mount the garden-sync volume
// 	3.2 Run the command inside the garden-service container
//
// For an existing project the CLI execs into to garden-service container and runs the command.

func main() {
	// find the project garden.yml
	cwd, err := os.Getwd()
	util.Check(err)

	_, projectName := findProject(cwd)

	// get the git root and relative path to it (we mount the git root, so that git version checks work)
	git, err := exec.LookPath("git")
	if err != nil {
		log.Fatal("Could not find git (Garden requires git to be installed)")
	}

	_, err = exec.LookPath("docker")
	if err != nil {
		log.Fatal("Could not find docker - Garden requires docker to be installed in order to run.")
	}

	_, err = exec.LookPath("kubectl")
	if err != nil {
		log.Fatal(
			"Could not find kubectl " +
				"(Garden requires a configured local Kubernetes cluster and for kubectl to be configured to access it)",
		)
	}

	// make sure the docker daemon is running
	_, err = dockerutil.Ping()
	if err != nil {
		log.Fatal(err.Error())
	}

	cmd := exec.Command(git, "rev-parse", "--show-toplevel")
	cmd.Env = os.Environ()
	gitRootBytes, err := cmd.Output()
	if err != nil {
		log.Fatal(
			"Current directory is not in a git repository (Garden projects currently need to be inside a git repository)",
		)
	}
	gitRoot := strings.TrimSpace(string(gitRootBytes))

	// run the command in the service container
	relPath, err := filepath.Rel(strings.TrimSpace(gitRoot), cwd)
	util.Check(err)

	err = runSyncService(projectName, gitRoot, relPath)
	util.Check(err)

	err = runGardenService(projectName, gitRoot, relPath, os.Args[1:])
	// do not print error if garden-service errors or if SIGINT
	if err != nil && err.Error() != "exit status 1" && err.Error() != "exit status 130" {
		util.Check(err)
		os.Exit(1)
	}

}
