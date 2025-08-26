# Dockerfile for KIWI-based ISO builds (GTK/TUI and WebUI).
# It clones fedora-kiwi-descriptions at runtime if not bind-mounted.

ARG image=registry.fedoraproject.org/fedora:rawhide
FROM ${image}
LABEL maintainer="anaconda-devel@lists.fedoraproject.org"

# Base tools:
# - kiwi + kiwi-systemdeps: kiwi-ng CLI and runtime deps
# - distribution-gpg-keys: Fedora repo keys
# - createrepo_c: local repo from Anaconda RPMs
# - xorriso, grub2-tools-minimal: ISO bits used by kiwi internally
# - git: runtime clone of fedora-kiwi-descriptions (if not provided)
RUN set -eux; \
    dnf -y update; \
    dnf -y install \
        kiwi kiwi-systemdeps distribution-gpg-keys \
        createrepo_c xorriso grub2-tools-minimal \
        dracut dracut-network dracut-live \
        dnf5 \
        git; \
    dnf clean all

# Working dirs:
# /kiwi/descriptions  - KIWI description tree (Fedora.kiwi + includes)
# /anaconda-rpms      - your locally built Anaconda RPMs (bind-mounted RO)
# /images             - output ISO (bind-mounted)
# /work               - kiwi working directory
RUN mkdir -p /kiwi/descriptions /anaconda-rpms /images /work

# Put our single-file KIWI descriptions in place
COPY workstation-boot.kiwi  /kiwi/descriptions/
# (pokud máš i webui .kiwi, přidej:)
# COPY workstation-webui.kiwi /kiwi/descriptions/

# Our wrappers (vygenerované z .j2) – dej je jak do /, tak do /kiwi/descriptions
COPY kiwi-build        /kiwi-build
COPY kiwi-build-webui  /kiwi-webui-build
COPY kiwi-build        /kiwi/descriptions/kiwi-build
COPY kiwi-build-webui  /kiwi/descriptions/kiwi-build-webui
RUN chmod +x /kiwi-build /kiwi-webui-build /kiwi/descriptions/kiwi-build /kiwi/descriptions/kiwi-build-webui


# Entry wrapper (does clone + calls upstream kiwi-build with proper args)
COPY entrypoint-kiwi /entrypoint-kiwi
RUN chmod +x /entrypoint-kiwi

WORKDIR /work
ENTRYPOINT ["/entrypoint-kiwi"]
