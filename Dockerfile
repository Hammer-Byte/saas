FROM oven/bun:latest

USER root

# Pin to the same Firefox ESR major as the developer workstation (Debian 13: 153.6.0esr)
# so Instagram/LinkedIn cookies from that browser are less sensitive to UA/version drift.
ARG FIREFOX_VERSION=153.6.0esr
ARG GECKODRIVER_VERSION=0.36.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
        curl \
        unzip \
        xz-utils \
        xfonts-75dpi \
        xfonts-base \
        fontconfig \
        libxrender1 \
        libjpeg62-turbo \
        libssl3 \
        libx11-6 \
        libxext6 \
        libxcb1 \
        zlib1g \
        # PDF text extraction (gem tenders analyzer)
        poppler-utils \
        # Selenium Firefox runtime deps + virtual display (headed Firefox under Xvfb)
        xvfb \
        libgtk-3-0 \
        libdbus-glib-1-2 \
        libxt6 \
        libasound2 \
        libx11-xcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxss1 \
        libxtst6 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcairo-gobject2 \
        libgdk-pixbuf-2.0-0 \
        libdbus-1-3 \
        libnspr4 \
        libnss3 \
    && wget -q -O /tmp/wkhtmltox.deb \
        https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bookworm_amd64.deb \
    && dpkg -i /tmp/wkhtmltox.deb \
    && apt-get install -f -y --no-install-recommends \
    && wget -q -O /tmp/firefox.tar.xz \
        "https://ftp.mozilla.org/pub/firefox/releases/${FIREFOX_VERSION}/linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.xz" \
    && mkdir -p /opt \
    && tar -C /opt -xJf /tmp/firefox.tar.xz \
    && ln -sf /opt/firefox/firefox /usr/bin/firefox \
    && wget -q -O /tmp/geckodriver.tar.gz \
        "https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VERSION}/geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz" \
    && tar -C /usr/local/bin -xzf /tmp/geckodriver.tar.gz \
    && chmod +x /usr/local/bin/geckodriver \
    && rm -f /tmp/wkhtmltox.deb /tmp/firefox.tar.xz /tmp/geckodriver.tar.gz \
    && rm -rf /var/lib/apt/lists/*

# Match workstation Firefox 153 desktop profile (override via compose if needed).
ENV FIREFOX_BINARY=/opt/firefox/firefox \
    FIREFOX_USER_AGENT="Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0" \
    FIREFOX_HEADLESS=0 \
    TZ=Asia/Kolkata

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build:windows-agents

VOLUME ["/app/media"]

EXPOSE 3000

# Headed Firefox under Xvfb — closer to this system's Mozilla than MOZ_HEADLESS=1.
CMD ["xvfb-run", "-a", "-s", "-screen 0 1440x1000x24", "bun", "app"]
