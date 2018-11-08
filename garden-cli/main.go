package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/garden-io/garden/garden-cli/dockerutil"
	"github.com/garden-io/garden/garden-cli/util"
	"github.com/pkg/errors"
)

type Dependency struct {
	bin          string
	errorMessage string
}

// A CLI for running Garden commands in a garden-service container.
//
// For a new project the flow is as follows:
//
// 	1. Create a named volume for the project.
// 	2. Create and start a garden-sync container that mounts the named volume.
// 	3. Start a sync session between the host and the garden-sync container that syncs the
// contents of the local project directory into the named project volume and watches for changes.
// 	4. Start a garden-service container that mounts the named volume
// 	5. Run the command inside the garden-service container
//
// The containers, volume and sync session are persistent, so for an existing project the CLI
// execs into to garden-service container and runs the command.
func main() {

	if err := checkDeps(); err != nil {
		log.Panicln(err)
		os.Exit(1)
	}

	// find the project garden.yml
	cwd, err := os.Getwd()
	util.Check(err)
	_, projectName := findProject(cwd)

	// get the git root and relative path to it (we mount the git root, so that git version checks work)
	git := util.GetBin("git")

	cmd := exec.Command(git, "rev-parse", "--show-toplevel")
	cmd.Env = os.Environ()
	gitRootBytes, err := cmd.Output()
	if err != nil {
		log.Panicln(
			"Current directory is not in a git repository (Garden projects currently need to be inside a git repository)",
		)
		os.Exit(1)
	}
	gitRoot := strings.TrimSpace(string(gitRootBytes))

	relPath, err := filepath.Rel(strings.TrimSpace(gitRoot), cwd)
	util.Check(err)

	projectID := getProjectID(gitRoot)
	volumeName := makeResourceName("garden-volume", projectName, projectID)
	syncContainerName := makeResourceName("garden-sync", projectName, projectID)
	serviceContainerName := makeResourceName("garden-service", projectName, projectID)

	// make sure the docker daemon is running
	if _, err = dockerutil.Ping(); err != nil {
		log.Panicln(err)
	}

	if err := ensureVolume(volumeName, syncContainerName, serviceContainerName); err != nil {
		log.Panicln(err)
	}

	if err := runSyncContainer(syncContainerName, volumeName, gitRoot); err != nil {
		log.Panicln(err)
	}

	if err := initSync(gitRoot, syncContainerName); err != nil {
		log.Panicln(err)
	}

	if err := runServiceContainer(serviceContainerName, volumeName, relPath); err != nil {
		log.Panicln(err)
	}

	// run the command inside the garden-service container
	err = dockerutil.Exec(append([]string{"exec", "-it", serviceContainerName, "garden"}, os.Args[1:]...), false)
	// do not print error if garden-service errors or if SIGINT
	if err != nil && err.Error() != "exit status 1" && err.Error() != "exit status 130" {
		log.Panicln(err)
		os.Exit(1)
	}

}

func checkDeps() error {
	deps := []Dependency{
		{
			bin:          "git",
			errorMessage: "Could not find git - Garden requires git to be installed",
		},
		{
			bin:          "docker",
			errorMessage: "Could not find docker - Garden requires docker to be installed in order to run.",
		},
		{
			bin:          "mutagen",
			errorMessage: "Could not find mutagen - Garden requires mutagen to be installed in order to run.",
		},
	}

	for _, dep := range deps {
		if _, err := exec.LookPath(dep.bin); err != nil {
			return errors.New(dep.errorMessage)
		}
	}

	// verify mutagen version
	currentMutagenVersion, err := exec.Command("mutagen", "version").Output()
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(currentMutagenVersion)) != MutagenVersion {
		return errors.Errorf("expected Mutagen version %s, got %s", currentMutagenVersion, MutagenVersion)
	}

	return nil
}
