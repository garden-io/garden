# Working with remote sources

With the Garden framework you can import remote sources and modules into your project, and run them just like your local modules and services. This is useful if your project's source code is spread across multiple repositories.

In this guide, we'll explain the details of working with remote sources and modules.

In what follows you'll learn how to:

* [Import remote sources](#importing-remote-sources)
* [Import remote modules](#importing-external-modules)
* [Update remote sources and modules](#updating-remote-sources-and-modules)
* [Link remote sources and modules to a local directory](#linking-remote-sources-and-modules)

>**Remote source**: Any arbitrary repository. Garden will treat this like every other directory within the project and scan for garden.yml config files.

>**Remote module**: The remote source code for a particular Garden module. In this case the garden.yml config is stored locally but the module code itself is remote.

## Importing remote sources
Garden can import arbitrary remote sources into a project. A remote source can contain any number of modules and is treated just like any other directory within the project. It's simply a directory that contains one or many Garden modules and is hosted in a remote repository.

To import remote sources we add their `name` and `respositoryUrl` under the `sources` key in the project level garden.yml config file:
```yml
project:
  name: my-project
  sources:
    - name: source-name # name of remote source
      repositoryUrl: https://my-git-server.com/source-name.git # git repository URL (can also point to a local file)
```

### Example

For example, let's say the our project has the following structure:
```sh
my-project
├── garden.yml
└── services
    ├── service-a
    │   ├── garden.yml
        ...
    ...
```
and that it depends on services that are maintained in different repositories that look like this:
```sh
source-a
└── services
    ├── service-b
    │   ├── garden.yml
        ...
    ├── service-c
    │   ├── garden.yml
        ...
```
and this:
```sh
source-b
└── services
    ├── service-d
    │   ├── garden.yml
        ...
```
Now, if we add the sources above to our project level garden.yml config file, `service-a`, `service-b`, `service-c` and `service-d` will all be integrated into the project.

## Importing remote modules

## Updating remote sources and modules

## Linking remote sources and modules
