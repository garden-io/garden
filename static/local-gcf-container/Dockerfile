FROM node:6

RUN npm install -g @google-cloud/functions-emulator@1.0.0-beta.4
RUN mkdir /app

WORKDIR /app

RUN wget https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-198.0.0-linux-x86_64.tar.gz \
 && tar -zxvf google-cloud-sdk-198.0.0-linux-x86_64.tar.gz \
 && ./google-cloud-sdk/install.sh \
 && /app/google-cloud-sdk/bin/gcloud components install alpha beta gsutil \
 && rm -f google-cloud-sdk-198.0.0-linux-x86_64.tar.gz

ADD config.json /root/.config/configstore/@google-cloud/functions-emulator/config.json
ADD start.sh /app/start.sh

ENTRYPOINT ["/app/start.sh"]
CMD []
