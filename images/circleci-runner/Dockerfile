#### gcloud base image ####
FROM google/cloud-sdk:411.0.0@sha256:b5c292e4cbf1ff57853a5f48bda5bf1f01c4750bc3d44a36a970e31d5a49bec8 as gcloud

#### ghr utility ####
FROM cibuilds/github:0.12.2@sha256:a247975213771f2f4c61b806771ef6c22b225fdc46558738b7c935517c0dcdd4 AS ghr

#### ldid utility ####
FROM cimg/node:21.1.0@sha256:371d4fd082e62b57d8bcd2294624880e35e25bebe07ed5ece0a28b09d0d9e0bb as ldid

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
FROM cimg/node:21.1.0@sha256:371d4fd082e62b57d8bcd2294624880e35e25bebe07ed5ece0a28b09d0d9e0bb

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
RUN wget -O kubectl https://storage.googleapis.com/kubernetes-release/release/v1.17.0/bin/linux/amd64/kubectl && \
  echo "6e0aaaffe5507a44ec6b1b8a0fb585285813b78cc045f8804e70a6aac9d1cb4c  kubectl" | sha256sum -c && \
  chmod +x kubectl && \
  sudo mv kubectl /usr/local/bin/ && \
  cd / && kubectl version --client=true # make sure it works
