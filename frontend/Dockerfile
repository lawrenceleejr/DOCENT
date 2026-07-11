FROM node:22-slim AS build
WORKDIR /app
# Building behind a TLS-inspecting proxy? Drop its PEM bundle at
# frontend/extra-ca.crt (gitignored) and it will be trusted during the build.
COPY package.json package-lock.json extra-ca.crt* ./
RUN if [ -f extra-ca.crt ]; then npm config set cafile /app/extra-ca.crt; fi \
    && npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts postcss.config.cjs index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
