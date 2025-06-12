#### gcloud base image ####
FROM google/cloud-sdk:495.0.0@sha256:19e21718258a1073f19bba970f6b22bcdc4b869d7b679bdddeb50985e69e75eb as gcloud

#### ghr utility ####
FROM cibuilds/github:0.13.0@sha256:2cee61741812b8ecaa53a92b0cdb3d8fea24bc7c50c9d394c055df97497857be AS ghr

#### ldid utility ####
FROM cimg/node:22.16.0@sha256:4b35806379d431601e325a2d33c090df5609a98e54309c167a3438a85063ac96 as ldid

RUN sudo apt-get update && sudo apt-get install -qq -y --no-install-recommends \
  git \
  perl \
  curl \
  build-essential

RUN cd /tmp && \
  git clone https://github.com/xerub/ldid.git && \
  cd ldid && \
  git checkout db74fea4424ddf8b217a0a8f98bcdc0d8ff29908 && \
  git submodule update --init && \
  ./make.sh && \
  sudo cp -f ./ldid /usr/local/bin/ldid

#### main ####
FROM cimg/node:22.16.0@sha256:4b35806379d431601e325a2d33c090df5609a98e54309c167a3438a85063ac96

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
RUN wget -O kubectl https://storage.googleapis.com/kubernetes-release/release/v1.30.4/bin/linux/amd64/kubectl && \
  echo "2ffd023712bbc1a9390dbd8c0c15201c165a69d394787ef03eda3eccb4b9ac06  kubectl" | sha256sum -c && \
  chmod +x kubectl && \
  sudo mv kubectl /usr/local/bin/ && \
  cd / && kubectl version --client=true # make sure it works
