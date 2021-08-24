#### gcloud base image ####
FROM google/cloud-sdk:277.0.0 as gcloud

#### main ####
FROM cimg/node:12.22.2

# install system deps
RUN sudo apt-get update && sudo apt-get -y install rsync parallel python3

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
