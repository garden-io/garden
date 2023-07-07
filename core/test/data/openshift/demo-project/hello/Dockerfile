FROM registry.access.redhat.com/ubi8/nginx-122
USER root
ADD index.html .
ADD OpenShift-LogoType.svg .
RUN chown -R 1000:0 .
RUN chmod -R g+wx .
USER 1000
CMD nginx -g "daemon off;"
