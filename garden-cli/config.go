package main

import (
	"io/ioutil"
	"log"
	"os"
	"path"
	"strings"

	"gopkg.in/yaml.v2"
)

// Config type must be public for the yaml parser (for some reason). We only need the project key and the name.
type Config struct {
	Project struct {
		Name *string
	}
}

func findProject(cwd string) (string, string) {
	projectDir := cwd

	for {
		configPath := path.Join(projectDir, "garden.yml")

		if _, err := os.Stat(configPath); !os.IsNotExist(err) {
			configYaml, err := ioutil.ReadFile(configPath)
			check(err)

			config := Config{}

			err = yaml.Unmarshal(configYaml, &config)
			if err != nil {
				log.Fatalf("Unable to parse %s as a valid garden configuration file", configPath)
			}

			if config.Project.Name != nil {
				// found project config
				return projectDir, *config.Project.Name
			}
		}

		// move up one level
		projectDir = path.Dir(projectDir)

		if projectDir == "/" {
			log.Fatalf("Not a project directory (or any of the parent directories): %s", cwd)
		}
	}
}

// Get or set the ID of this project (stored in PROJECT_ROOT/.garden/id).
// TODO: might wanna use a lockfile for concurrency here
func getProjectID(projectDir string) string {
	gardenDir := path.Join(projectDir, ".garden")
	ensureDir(gardenDir)

	idPath := path.Join(gardenDir, "id")

	var projectID string

	if _, err := os.Stat(idPath); !os.IsNotExist(err) {
		idData, err := ioutil.ReadFile(idPath)
		check(err)
		projectID = strings.TrimSpace(string(idData))
	} else {
		projectID = randSeq(8)
		err := ioutil.WriteFile(idPath, []byte(projectID), 0644)
		check(err)
	}

	return projectID
}

func getGardenHomeDir() string {
	// TODO: allow override via env var
	homeDir := getHomeDir()
	gardenHome := path.Join(homeDir, ".garden")

	ensureDir(gardenHome)

	return gardenHome
}
