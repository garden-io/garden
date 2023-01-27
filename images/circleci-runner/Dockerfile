#### gcloud base image ####
FROM google/cloud-sdk:411.0.0 as gcloud

#### ghr utility ####
FROM cibuilds/github:0.12.2 AS ghr

#### ldid utility ####
FROM cimg/node:16.18.0 as ldid

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
FROM cimg/node:16.18.0

# install system deps
RUN sudo apt-get update && sudo apt-get -y install rsync parallel python3 curl

# install ldid
COPY --from=ldid /usr/local/bin/ldid /usr/local/bin

# install ghr
COPY --from=ghr /usr/bin/ghr /usr/bin/

# install gh
# NOTE: We pin to this version because the latest version does not support the fine-grained access tokens for editing issues (https://github.com/cli/cli/issues/6680)
# When the issue has been resolved, we can go back to installing the latest version of gh.
RUN wget https://github.com/cli/cli/releases/download/v2.14.7/gh_2.14.7_linux_amd64.deb && sudo dpkg -i gh_2.14.7_linux_amd64.deb && rm gh_2.14.7_linux_amd64.deb

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
