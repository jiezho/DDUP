FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/mobile/package.json ./apps/mobile/
RUN npm install

COPY packages/shared ./packages/shared
COPY apps/mobile ./apps/mobile

WORKDIR /app/apps/mobile
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

