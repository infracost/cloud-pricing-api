FROM node:14.15.0-alpine3.12 as build

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
RUN cp -R node_modules prod_node_modules
RUN npm install
COPY . .
RUN npm run build

FROM node:14.15.0-alpine3.12 as release

WORKDIR /usr/src/app
COPY --from=build /usr/src/app/prod_node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package*.json ./
EXPOSE 4000
CMD [ "npm", "run", "start" ]
