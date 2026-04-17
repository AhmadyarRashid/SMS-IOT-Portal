# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# New SMS IoT env vars (preferred)
ARG VITE_SMS_IOT_URL
ARG VITE_SMS_IOT_REALM=master
ENV VITE_SMS_IOT_URL=$VITE_SMS_IOT_URL
ENV VITE_SMS_IOT_REALM=$VITE_SMS_IOT_REALM

# Legacy names — still accepted as a fallback by the app at runtime.
ARG VITE_OPENREMOTE_URL
ARG VITE_OPENREMOTE_REALM
ENV VITE_OPENREMOTE_URL=$VITE_OPENREMOTE_URL
ENV VITE_OPENREMOTE_REALM=$VITE_OPENREMOTE_REALM

RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
