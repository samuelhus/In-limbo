FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package*.json ./
RUN yarn install --network-timeout 300000

COPY . .

# Relatief pad: nginx (hieronder) stuurt /api door naar de backend-container.
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

ARG REACT_APP_SENTRY_DSN=""
ENV REACT_APP_SENTRY_DSN=$REACT_APP_SENTRY_DSN

ARG REACT_APP_ENVIRONMENT="production"
ENV REACT_APP_ENVIRONMENT=$REACT_APP_ENVIRONMENT

ARG REACT_APP_UMAMI_URL=""
ENV REACT_APP_UMAMI_URL=$REACT_APP_UMAMI_URL

ARG REACT_APP_UMAMI_WEBSITE_ID=""
ENV REACT_APP_UMAMI_WEBSITE_ID=$REACT_APP_UMAMI_WEBSITE_ID

# Vermindert geheugengebruik tijdens de build aanzienlijk — geen source maps
# nodig in productie, en dit is vaak de oorzaak van "heap out of memory"
# fouten op Droplets met weinig RAM.
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS="--max-old-space-size=1536"

RUN yarn build

# Productie: nginx om de build te serveren
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html

# Nginx config voor React Router (alle routes → index.html)
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://backend:8000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
