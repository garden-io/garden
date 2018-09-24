package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	// find the project garden.yml
	cwd, err := os.Getwd()
	check(err)

	_, projectName := findProject(cwd)

	// get the git root and relative path to it (we mount the git root, so that git version checks work)
	git, err := exec.LookPath("git")
	if err != nil {
		log.Fatal("Could not find git (Garden requires git to be installed)")
	}

	_, err = exec.LookPath("kubectl")
	if err != nil {
		log.Fatal(
			"Could not find kubectl " +
				"(Garden requires a configured local Kubernetes cluster and for kubectl to be configured to access it)",
		)
	}

	cmd := exec.Command(git, "rev-parse", "--show-toplevel")
	cmd.Env = os.Environ()
	gitRootBytes, err := cmd.Output()
	if err != nil {
		log.Fatal(
			"Current directory is not in a git repository (Garden projects currently need to be inside a git repository)",
		)
	}
	gitRoot := string(gitRootBytes)

	// run the command in the service container
	relPath, err := filepath.Rel(strings.TrimSpace(gitRoot), cwd)
	check(err)

	err = runGardenService(projectName, gitRoot, relPath, os.Args[1:])
	if err != nil {
		os.Exit(1)
	}
}
