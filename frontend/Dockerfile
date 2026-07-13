FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package*.json ./
RUN yarn install --network-timeout 300000

COPY . .

# Relatief pad: nginx (hieronder) stuurt /api door naar de backend-container.
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

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
