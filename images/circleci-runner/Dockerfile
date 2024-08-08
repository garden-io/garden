#### gcloud base image ####
FROM google/cloud-sdk:487.0.0@sha256:3827f5af870bb9aed17b0ab6d841381798df7344c2b1535818a4e731d3daaed5 as gcloud

#### ghr utility ####
FROM cibuilds/github:0.13.0@sha256:a247975213771f2f4c61b806771ef6c22b225fdc46558738b7c935517c0dcdd4 AS ghr

#### ldid utility ####
FROM cimg/node:22.6.0@sha256:a2353f631cd52030a0de3bc4e59093cf4eaff02ae46bbbb9261581dd3e49d2d2 as ldid

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
FROM cimg/node:22.6.0@sha256:a2353f631cd52030a0de3bc4e59093cf4eaff02ae46bbbb9261581dd3e49d2d2

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
RUN wget -O kubectl https://storage.googleapis.com/kubernetes-release/release/v1.30.2/bin/linux/amd64/kubectl && \
  echo "c6e9c45ce3f82c90663e3c30db3b27c167e8b19d83ed4048b61c1013f6a7c66e  kubectl" | sha256sum -c && \
  chmod +x kubectl && \
  sudo mv kubectl /usr/local/bin/ && \
  cd / && kubectl version --client=true # make sure it works
