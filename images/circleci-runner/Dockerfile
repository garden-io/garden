#### gcloud base image ####
FROM google/cloud-sdk:411.0.0 as gcloud

#### ghr utility ####
FROM cibuilds/github:0.12.2 AS ghr

#### ldid utility ####
FROM cimg/node:14.19.3 as ldid

RUN sudo apt-get update && sudo apt-get install -qq -y --no-install-recommends \
  git \
  perl \
  curl \
  build-essential

RUN cd /tmp && \
  git clone https://github.com/xerub/ldid.git && \
  cd ldid && \
  git submodule update --init && \
  ./make.sh && \
  sudo cp -f ./ldid /usr/local/bin/ldid

#### main ####
FROM cimg/node:14.19.3

# install system deps
RUN sudo apt-get update && sudo apt-get -y install rsync parallel python3 curl

# install ldid
COPY --from=ldid /usr/local/bin/ldid /usr/local/bin

# install ghr
COPY --from=ghr /usr/bin/ghr /usr/bin/

# install gh
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /usr/share/keyrings/githubcli-archive-keyring.gpg > /dev/null \
  && sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && sudo apt-get update \
  && sudo apt-get install gh -y

# install gcloud
ENV CLOUDSDK_PYTHON=python3
COPY --from=gcloud /usr/lib/google-cloud-sdk /usr/lib/google-cloud-sdk
RUN sudo ln -s /usr/lib/google-cloud-sdk/bin/* /usr/local/bin/ \
  && sudo chmod +x /usr/local/bin/*  \
  && cd / && gcloud version # make sure it works

# install kubectl
RUN curl -o kubectl curl -LO https://storage.googleapis.com/kubernetes-release/release/v1.17.0/bin/linux/amd64/kubectl \
  && chmod +x kubectl \
  && sudo mv kubectl /usr/local/bin/ \
  && cd / && kubectl version --client=true # make sure it works
