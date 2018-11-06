package main

import (
	"log"
	"os"
	"path"
	"testing"
)

func TestWorkingDirectory(t *testing.T) {
	testDir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	path := path.Join(testDir, "../examples/hello-world/services/hello-container")
	dir, name := findProject(path)
	t.Log(dir)
	t.Log(name)
	if name != "hello-world" {
		t.Errorf("Expected the projectname to be %v but instead got %v", "hello-world", name)
	}
}
