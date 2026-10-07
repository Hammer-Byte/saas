FROM oven/bun

WORKDIR /app

COPY package.json ./

RUN bun install

COPY . .

VOLUME ["/data/documents"]

EXPOSE 3000

CMD ["bun", "run", "start"]
