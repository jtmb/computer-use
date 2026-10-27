FROM ghcr.io/anomalyco/opencode:2.0.0@sha256:c714c5ca046223a782faac0a5fdd3971cf3a57f39bd45eaf7d1a8b82f37ad183 AS opencode

USER 0:0
RUN mkdir -p /home/opencode/.local/share/opencode /home/opencode/.config/opencode \
    /home/opencode/.local/state/opencode /workspace \
    && chown -R 65532:65532 /home/opencode /workspace
ENV HOME=/home/opencode \
    XDG_DATA_HOME=/home/opencode/.local/share \
    XDG_CONFIG_HOME=/home/opencode/.config \
    XDG_STATE_HOME=/home/opencode/.local/state \
    XDG_CACHE_HOME=/tmp/opencode-cache
WORKDIR /workspace
USER 65532:65532

FROM ghcr.io/tailscale/tailscale:v1.104.2@sha256:b11583ad2e93e4671128538c88cf11f460444a5d7e449311dd1933a400ab849d AS tailscale

RUN mkdir -p /var/lib/tailscale /var/run/tailscale /var/cache/tailscale \
    && chown -R 65532:65532 /var/lib/tailscale /var/run/tailscale /var/cache/tailscale \
    && chmod 0700 /var/lib/tailscale /var/run/tailscale /var/cache/tailscale

USER 65532:65532

ARG RELEASE_REVISION=1
LABEL org.opencontainers.image.title="Tailscale" \
      org.opencontainers.image.description="Minimal non-root derivative of the official Tailscale container." \
      org.opencontainers.image.source="https://github.com/jtmb/tailscale" \
      org.opencontainers.image.base.name="ghcr.io/tailscale/tailscale:v1.104.2" \
      org.opencontainers.image.version="1.104.2-r${RELEASE_REVISION}"
