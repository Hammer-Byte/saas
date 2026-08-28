FROM oven/bun:latest

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
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
    && wget -q -O /tmp/wkhtmltox.deb \
        https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bookworm_amd64.deb \
    && dpkg -i /tmp/wkhtmltox.deb \
    && apt-get install -f -y --no-install-recommends \
    && rm -f /tmp/wkhtmltox.deb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

VOLUME ["/app/media"]

EXPOSE 3000

CMD ["bun", "app"]
