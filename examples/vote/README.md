# Voting example project

Example voting application where you can vote for either cats or dogs. You can vote as many times as you would like.


## Usage

The simplest way to see this in action is to run `garden deploy` or `garden dev` in the project's top-level directory.

```sh
garden dev
Good afternoon! Let's get your environment wired up...

✔ local-kubernetes          → Configured
✔ jworker                   → Building jworker:8bbc389b3e... → Done (took 0.6 sec)
✔ postgres                  → Building → Done (took 0.4 sec)
✔ result                    → Building result:8bbc389b3e... → Done (took 0.5 sec)
✔ vote                      → Building vote:8bbc389b3e-1543837972... → Done (took 0.5 sec)
✔ redis                     → Checking status → Version 8bbc389b3e already deployed
✔ db                        → Checking status → Version 8bbc389b3e already deployed
✔ result                    → Checking status → Version 8bbc389b3e already deployed
```

### To Vote

open http://vote.local.app.garden/

### View Results

open http://vote.local.app.garden/result

## Setup

### Step 1 - Install mkcert

If you don't have mkcert installed, follow the instructions [here](https://github.com/FiloSottile/mkcert#installation).

### Step 2 - Generate a certificate

Run `mkcert -install`

then

```sh
mkcert local.app.garden '*.local.app.garden'
```

_Note: You may choose another hostname if you prefer, but you'll need to update the project `garden.yml` accordingly._

### Step 3 - Configure the certificate in your Kubernetes installation

Create a Kubernetes Secret with your generated certificate and key.

```sh
kubectl create secret -n default tls garden-tls --key local.app.garden+1-key.pem --cert local.app.garden+1.pem
```


## Running

```sh
garden dev --hot-reload=front-end
```
