FROM --platform=linux/amd64 node:18-alpine

COPY app /app
WORKDIR /app

RUN npm install --force
RUN npm run build

EXPOSE 3000
CMD [ "npm", "run", "start" ]