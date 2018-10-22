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
	gitRoot := strings.TrimSpace(string(gitRootBytes))

	// run the command in the service container
	relPath, err := filepath.Rel(strings.TrimSpace(gitRoot), cwd)
	check(err)

	args := os.Args[1:]
	watch := fsWatchEnabled(args)

	if watch {
		err = runSyncContainer(projectName, gitRoot, relPath)
		if err != nil {
			os.Exit(1)
		}
	}

	err = runGardenService(projectName, gitRoot, relPath, watch, args)
	if err != nil {
		os.Exit(1)
	}
}

// FIXME: We need a proper way to check if the command requires file system watch. This is not it.
func fsWatchEnabled(args []string) bool {
	if len(args) > 0 && args[0] == "dev" {
		return true
	}
	for _, el := range args {
		if el == "--watch" || el == "-w" || el == "hot-reload" {
			return true
		}
	}
	return false
}
