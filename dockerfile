FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/dist/music-player-fe/browser/ /usr/share/nginx/html/

EXPOSE 80

CMD ["/bin/sh", "-c", "envsubst '${BACKEND_UPSTREAM}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]