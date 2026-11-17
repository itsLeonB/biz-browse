FROM node:26-bookworm-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3107
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM app AS test
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*

FROM app AS production
