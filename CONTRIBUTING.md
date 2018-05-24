## Developing the Garden CLI framework

### Contributing guidelines

We heartily welcome any form of contribution to the project, including issue reports, feature requests, 
discussion, pull requests and any type of feedback. We request that all contributors 
adhere to the [Contributor Covenant](CODE_OF_CONDUCT.md) and work with us to make the collaboration and 
community productive and fun for everyone :)

### Commit messages

We follow and automatically validate 
[Angular-like formatting](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits) for our
commit messages, for consistency and clarity.

### Setting up your development environment

Start by cloning the repo.

For Mac we have a script that installs all required dependencies, mostly via Homebrew:

    ./bin/bootstrap/mac-dev
    
Other platforms need to roll their own for now (contributions welcome!). Please have a look
at the script for Mac to see what's installed. Once dependencies are in place, all you need is:  
    
    npm install
    
### Running a development version

While developing, we recommend you run the dev command in your console:

    npm run dev
    
This will do an initial development build, `npm link` it to your global npm folder, and then watch for 
changes and auto-rebuild as you code. You can then run the `garden` command as normal. 
    
Also, you might like to add a couple of shorthands:

    alias g='garden'
    alias k='kubectl'
    
### Testing

Tests are run using `mocha`. To run the full test suite, including linting and other validation, simply run

    npm test
    
#### CI

We use [Circle CI](https://circleci.com) for integration testing. Sometimes
it can be useful to test and debug the CI build locally, particularly when 
updating or adding dependencies. You can use their 
[CLI](https://circleci.com/docs/2.0/local-jobs/) for that, which
is installed automatically by the `./bin/bootstrap/mac-dev` script. Once you
have it installed you can run `circleci build` in the repo root to test 
the build locally.

### License/copyright headers

Every source file must include the contents of `static/license-header.txt` at the top. This is 
automatically checked during CI. You can run the check with `npm run check-licenses` and you can
automatically add the header to new sources using `npm run add-licenses`. 
  
### Release process

We use [Release It!](https://github.com/webpro/release-it) to automate the release process.

To set up, first make sure you're logged in to npm (`npm login`). You'll also need to get a 
[Github token](https://github.com/settings/tokens) for the repository with "repo" access to 
the repository ("admin" scope is not necessary) and expose it as an environment variable:

    export GITHUB_TOKEN="f941e0..."
    
Then to start the release process, use any of the following commands:

    npm run release-major  # for major (potentially breaking) updates, e.g. 2.0.0 
    npm run release-minor  # for minor releases, e.g. 0.10.0
    npm run release-patch  # for bugfix releases, e.g. 0.10.1 

