package main

// SyncImage is which docker image to use for syncing
const SyncImage = "gardenengine/garden-sync:latest"

// ServiceImage is which docker image to use for garden service
const ServiceImage = "gardenengine/garden-service:latest"

// ProjectPath is where to find the code inside ServiceImage
const ProjectPath = "/project"

// Mutagen is the synchronization tool Garden uses for syncing files from
// the host into the sync container. Expects the following version.
const MutagenVersion = "0.7.0"
