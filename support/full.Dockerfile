ARG TAG=latest
FROM gardendev/garden:${TAG}-gcloud

# Required by Azure DevOps to tell the system where node is installed
LABEL "com.azure.dev.pipelines.agent.handler.node.path"="/usr/local/bin/node"

ENV KUBELOGIN_VERSION=v0.0.9

RUN pip install awscli==1.22.77 --upgrade

RUN curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator \
  && chmod +x ./aws-iam-authenticator \
  && mv ./aws-iam-authenticator /usr/bin/

# Build dependencies
RUN apk add --virtual=build gcc libffi-dev musl-dev openssl-dev make py3-pip \
  # Runtime dependency
  && apk add python3-dev \
  && pip3 install virtualenv \
  && python3 -m virtualenv /azure-cli \
  && /azure-cli/bin/python -m pip --no-cache-dir install azure-cli \
  && echo "#!/usr/bin/env sh" > /usr/bin/az \
  && echo '/azure-cli/bin/python -m azure.cli "$@"' >> /usr/bin/az \
  && chmod +x /usr/bin/az \
  && wget https://github.com/Azure/kubelogin/releases/download/${KUBELOGIN_VERSION}/kubelogin-linux-amd64.zip \
  && unzip kubelogin-linux-amd64.zip \
  && cp bin/linux_amd64/kubelogin /usr/bin/

RUN mkdir -p /opt/ibmcloud \
  && cd /opt/ibmcloud \
  && curl -o ibmcloud_installer.tar.gz https://download.clis.cloud.ibm.com/ibm-cloud-cli/2.2.0/IBM_Cloud_CLI_2.2.0_amd64.tar.gz \
  && tar -zxf ibmcloud_installer.tar.gz \
  && cd Bluemix_CLI/ \
  && ./install \
  && cd $HOME \
  && ibmcloud plugin install container-service
