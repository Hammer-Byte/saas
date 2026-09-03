FROM oven/bun:latest

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
        curl \
        unzip \
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
        # Selenium Firefox + headless support
        firefox-esr \
        xvfb \
        libgtk-3-0 \
        libdbus-glib-1-2 \
        libxt6 \
        libasound2 \
    && wget -q -O /tmp/wkhtmltox.deb \
        https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bookworm_amd64.deb \
    && dpkg -i /tmp/wkhtmltox.deb \
    && apt-get install -f -y --no-install-recommends \
    && GECKODRIVER_VERSION=0.35.0 \
    && wget -q -O /tmp/geckodriver.tar.gz \
        "https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VERSION}/geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz" \
    && tar -C /usr/local/bin -xzf /tmp/geckodriver.tar.gz \
    && chmod +x /usr/local/bin/geckodriver \
    && rm -f /tmp/wkhtmltox.deb /tmp/geckodriver.tar.gz \
    && rm -rf /var/lib/apt/lists/*

ENV MOZ_HEADLESS=1

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

VOLUME ["/app/media"]

EXPOSE 3000

CMD ["bun", "app"]
