#### gcloud base image ####
FROM google/cloud-sdk:411.0.0@sha256:b5c292e4cbf1ff57853a5f48bda5bf1f01c4750bc3d44a36a970e31d5a49bec8 as gcloud

#### ghr utility ####
FROM cibuilds/github:0.12.2@sha256:a247975213771f2f4c61b806771ef6c22b225fdc46558738b7c935517c0dcdd4 AS ghr

#### ldid utility ####
FROM cimg/node:18.15.0@sha256:df9aca3abafd201dec9bfa7bff8acda46fdaee9dc20be669aeaf025fcaa0c029 as ldid

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
FROM cimg/node:18.15.0@sha256:df9aca3abafd201dec9bfa7bff8acda46fdaee9dc20be669aeaf025fcaa0c029

# install system deps
RUN sudo apt-get update && sudo apt-get -y install rsync parallel python3 curl

# install ldid
COPY --from=ldid /usr/local/bin/ldid /usr/local/bin

# install ghr
COPY --from=ghr /usr/bin/ghr /usr/bin/

# install gh
# NOTE: We pin to this version because the latest version does not support the fine-grained access tokens for editing issues (https://github.com/cli/cli/issues/6680)
# When the issue has been resolved, we can go back to installing the latest version of gh.
RUN wget https://github.com/cli/cli/releases/download/v2.14.7/gh_2.14.7_linux_amd64.deb && \
  echo "b7ee6f6eb9fb75621bad26b8de7cf457700c33d2f93065a73a77bb3a7a135036  gh_2.14.7_linux_amd64.deb" | sha256sum -c && \
  sudo dpkg -i gh_2.14.7_linux_amd64.deb && \
  rm gh_2.14.7_linux_amd64.deb

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
