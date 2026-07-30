# BetterMTA OTP serve image — thin wrapper around pinned upstream.
#
# Base: opentripplanner/opentripplanner:2.9.0 (do not float tags)
# Graph artifacts are NOT baked in — mount at runtime:
#   host: services/otp/var/otp/graphs  →  /otp-graphs
# Entrypoint stages active graph.obj + configs into /var/opentripplanner.
#
#   docker build -f services/otp/Dockerfile -t bettermta-otp ./services/otp
#
# Memory: serve needs ~2g heap / ~3.5g container (see services/otp/RUNBOOK.md).
# Note: avoid apt (arm64 ports hash mismatches) and alpine curl (wrong libc).

FROM opentripplanner/opentripplanner:2.9.0

LABEL org.opencontainers.image.title="bettermta-otp" \
      org.opencontainers.image.description="BetterMTA OTP 2.9.0 with router/build configs; graph via volume" \
      bettermta.otp.version="2.9.0"

USER root

COPY config/build-config.json /otp-config/build-config.json
COPY config/router-config.json /otp-config/router-config.json
COPY docker/entrypoint.sh /usr/local/bin/bettermta-otp-entrypoint.sh
COPY docker/healthcheck.sh /usr/local/bin/bettermta-otp-healthcheck.sh
RUN chmod +x /usr/local/bin/bettermta-otp-entrypoint.sh \
             /usr/local/bin/bettermta-otp-healthcheck.sh

# OTP substitutes ${BETTERMTA_DATA_HOST} / ${BETTERMTA_INTERNAL_TOKEN} in router-config.
ENV BETTERMTA_DATA_HOST=data:8082 \
    BETTERMTA_INTERNAL_TOKEN= \
    JAVA_XMX=2g \
    OTP_GRAPHS_DIR=/otp-graphs \
    OTP_LOAD_DIR=/var/opentripplanner

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=120s --retries=5 \
  CMD ["/usr/local/bin/bettermta-otp-healthcheck.sh"]

ENTRYPOINT ["/usr/local/bin/bettermta-otp-entrypoint.sh"]
