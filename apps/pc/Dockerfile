FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/pc/package.json ./apps/pc/
RUN npm install

COPY packages/shared ./packages/shared
COPY apps/pc ./apps/pc

WORKDIR /app/apps/pc
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/pc/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/pc/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

